import type { Embedder } from '../types';
import { HashEmbedder } from './HashEmbedder';
import { MiniLmEmbedder } from './MiniLmEmbedder';

export type EmbedderChoice = 'auto' | 'minilm' | 'hash';

/**
 * Create the embedder for a given choice. The returned embedder is NOT yet
 * loaded — callers invoke `load()` when ready (typically on first use or
 * via `Rag.warmup()`).
 *
 * `auto`: returns a wrapper that tries MiniLM first; if `load()` fails,
 * transparently swaps in a Hash embedder. Once a fallback occurs, all
 * subsequent calls use it.
 */
export const createEmbedder = (choice: EmbedderChoice): Embedder => {
  if (choice === 'hash') return new HashEmbedder();
  if (choice === 'minilm') return new MiniLmEmbedder();
  return new AutoEmbedder();
};

class AutoEmbedder implements Embedder {
  private inner: Embedder;
  private fellBack = false;

  constructor() {
    this.inner = new MiniLmEmbedder();
  }

  get name(): string {
    return this.inner.name;
  }
  get dim(): number {
    return this.inner.dim;
  }
  isReady(): boolean {
    return this.inner.isReady();
  }

  async load(opts?: { onDownloadProgress?: (pct: number) => void }): Promise<boolean> {
    const ok = await this.inner.load(opts);
    if (ok) return true;
    if (!this.fellBack) {
      // MiniLM unavailable — swap to Hash and stay there for the session.
      this.inner = new HashEmbedder();
      this.fellBack = true;
      await this.inner.load();
    }
    return this.inner.isReady();
  }

  async embed(text: string): Promise<number[]> {
    return this.inner.embed(text);
  }

  async unload(): Promise<void> {
    await this.inner.unload();
  }
}
