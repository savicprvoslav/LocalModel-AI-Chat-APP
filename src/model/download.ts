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

  // Resume if a partial download exists at target.
  const partial = await FS.getInfoAsync(target);
  const partialSize =
    partial.exists && 'size' in partial && typeof partial.size === 'number'
      ? partial.size
      : 0;

  const resumable = FS.createDownloadResumable(
    entry.url,
    target,
    partialSize ? { headers: { Range: `bytes=${partialSize}-` } } : {},
    (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
      if (opts.signal?.aborted) return;
      const total = progress.totalBytesExpectedToWrite || entry.sizeBytes;
      const written = partialSize + progress.totalBytesWritten;
      opts.onProgress?.(Math.min(1, written / total));
    }
  );

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => {
      resumable.pauseAsync().catch(() => undefined);
    });
  }

  const result = await resumable.downloadAsync();
  if (!result) throw new Error('download returned no result');

  if (!opts.skipShaCheck) {
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
  }

  opts.onProgress?.(1);
  return target;
};
