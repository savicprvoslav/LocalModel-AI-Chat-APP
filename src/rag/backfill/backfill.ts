import type { Embedder } from '../types';
import type { VectorStore } from '../storage/types';

/**
 * Re-embed messages that don't yet have a vector for the active embedder.
 *
 * Idempotent and resumable — runs `listUnembedded()` repeatedly until the
 * store reports zero remaining. Yields between batches so the UI thread
 * stays responsive on large corpora.
 *
 * Failure of an individual message is swallowed; we don't want one bad
 * row to halt the whole pass. The next run picks up where we left off.
 */
export type RunBackfillOpts = {
  batchSize?: number;
  yieldMs?: number;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
};

export const runBackfill = async (
  deps: { embedder: Embedder; vectors: VectorStore },
  opts: RunBackfillOpts = {}
): Promise<{ embedded: number; total: number }> => {
  if (!deps.embedder.isReady()) {
    return deps.vectors.coverage(deps.embedder.name);
  }
  const batchSize = opts.batchSize ?? 50;
  const yieldMs = opts.yieldMs ?? 200;

  // Initial total — what we're aiming for. We compute progress against this
  // baseline so the bar fills monotonically even if new messages arrive
  // mid-run.
  const start = await deps.vectors.coverage(deps.embedder.name);
  const target = start.total;
  if (target === 0) return start;

  while (!opts.signal?.aborted) {
    const batch = await deps.vectors.listUnembedded(
      deps.embedder.name,
      batchSize
    );
    if (batch.length === 0) break;

    for (const row of batch) {
      if (opts.signal?.aborted) break;
      try {
        const vector = await deps.embedder.embed(row.content);
        await deps.vectors.upsert({
          messageId: row.id,
          vector,
          embedder: deps.embedder.name
        });
      } catch {
        // Swallow per-row failures — a bad message shouldn't stall the pass.
      }
    }

    if (opts.onProgress) {
      const cov = await deps.vectors.coverage(deps.embedder.name);
      const pct = Math.min(1, cov.embedded / Math.max(1, target));
      opts.onProgress(pct);
    }

    // Yield to the UI thread between batches.
    await new Promise<void>((r) => setTimeout(r, yieldMs));
  }

  return deps.vectors.coverage(deps.embedder.name);
};
