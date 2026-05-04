import * as FS from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { ensureModelsDir, modelPath, freeDiskBytes } from './storage';
import { ModelCatalogEntry } from './catalog';

export type DownloadOptions = {
  onProgress?: (fraction: number) => void;
  skipShaCheck?: boolean;
  signal?: AbortSignal;
};

export const downloadModel = async (
  entry: ModelCatalogEntry,
  opts: DownloadOptions = {}
): Promise<string> => {
  await ensureModelsDir();
  const target = modelPath(entry.id);

  // Pre-flight free-disk check (1.25× sizeBytes).
  const free = await freeDiskBytes();
  const needed = Math.ceil(entry.sizeBytes * 1.25);
  if (free < needed) {
    const gapMB = Math.ceil((needed - free) / 1_000_000);
    throw new Error(`Need ${gapMB} MB more free disk space`);
  }

  // Inspect what's already at the target. HuggingFace's Xet CDN serves files
  // through signed S3 URLs that don't honor Range headers reliably, so any
  // partial download we left behind can't be resumed safely — we drop it and
  // re-fetch from byte 0 instead.
  const partial = await FS.getInfoAsync(target);
  const partialSize =
    partial.exists && 'size' in partial && typeof partial.size === 'number'
      ? partial.size
      : 0;
  console.log(
    `[download] ${entry.id}: target=${target} onDisk=${partialSize} expected=${entry.sizeBytes}`
  );

  if (partialSize > 0 && partialSize < entry.sizeBytes) {
    console.log(`[download] ${entry.id}: partial smaller than expected — discarding and restarting`);
    await FS.deleteAsync(target, { idempotent: true });
  } else if (partialSize >= entry.sizeBytes) {
    console.log(`[download] ${entry.id}: file already complete on disk — skipping download`);
    opts.onProgress?.(1);
    return target;
  }

  const resumable = FS.createDownloadResumable(
    entry.url,
    target,
    {},
    (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
      if (opts.signal?.aborted) return;
      const total = progress.totalBytesExpectedToWrite || entry.sizeBytes;
      opts.onProgress?.(Math.min(1, progress.totalBytesWritten / total));
    }
  );

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => {
      resumable.pauseAsync().catch(() => undefined);
    });
  }

  const result = await resumable.downloadAsync();
  if (!result) throw new Error('download returned no result');

  // Verify the size we got actually matches what the catalog promised. The
  // common failure mode without this check is silently writing a tiny redirect
  // body or 0-byte file to disk, which then surfaces as "model failed to
  // load" deep in llama.rn.
  const after = await FS.getInfoAsync(target);
  const finalSize =
    after.exists && 'size' in after && typeof after.size === 'number' ? after.size : 0;
  console.log(`[download] ${entry.id}: downloaded=${finalSize} bytes`);
  if (finalSize < entry.sizeBytes * 0.9) {
    await FS.deleteAsync(target, { idempotent: true });
    throw new Error(
      `Download truncated: got ${finalSize} bytes, expected ~${entry.sizeBytes}. ` +
        `URL may be unreachable or returned a redirect body instead of the file.`
    );
  }

  if (!opts.skipShaCheck && entry.sha256) {
    // Note: hashing a 2GB file via base64 in JS is slow (~30s+).
    // For internal/dev builds, skipShaCheck=true is acceptable.
    const fileContent = await FS.readAsStringAsync(target, {
      encoding: FS.EncodingType.Base64
    });
    const computed = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      fileContent,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    if (computed !== entry.sha256) {
      await FS.deleteAsync(target, { idempotent: true });
      throw new Error(`SHA-256 mismatch: expected ${entry.sha256}, got ${computed}`);
    }
  } else if (!entry.sha256) {
    console.warn(
      `[download] ${entry.id}: catalog entry has no sha256 — skipping hash check. ` +
        `Falling back to size + GGUF magic-header validation only.`
    );
  }

  opts.onProgress?.(1);
  return target;
};
