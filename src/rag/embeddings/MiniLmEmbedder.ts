import type { Embedder } from '../types';

/**
 * MiniLM-L6-v2 (384-dim) sentence embeddings via `react-native-executorch`.
 *
 * Native module — only works in a development build (not Expo Go, not Jest).
 * `react-native-executorch` is required at call time so the JS layer compiles
 * even when the native module isn't linked.
 *
 * The model file (~22 MB) and tokenizer (~5 MB) are fetched on first load.
 * After that, embeddings run on-device in CPU.
 *
 * Failure modes are surfaced via `load()` returning false and `isReady()`
 * staying false — the factory then falls back to HashEmbedder.
 */

export const MINILM_EMBEDDER_NAME = 'minilm-l6-v2';
const MINILM_DIM = 384;

type TextEmbeddingsModule = {
  forward(text: string): Promise<Float32Array | number[]>;
  delete(): void;
};

type TextEmbeddingsModuleStatic = {
  fromCustomModel(
    modelSource: unknown,
    tokenizerSource: unknown,
    onProgress?: (pct: number) => void
  ): Promise<TextEmbeddingsModule>;
};

type ExecutorchExports = {
  TextEmbeddingsModule?: TextEmbeddingsModuleStatic;
  ALL_MINILM_L6_V2?: unknown;
  ALL_MINILM_L6_V2_TOKENIZER?: unknown;
  initExecutorch?: (cfg: { resourceFetcher: unknown }) => void;
};

let _exec: ExecutorchExports | null | undefined;
let _execInited = false;

const tryRequireExecutorch = (): ExecutorchExports | null => {
  if (_exec !== undefined) return _exec;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _exec = require('react-native-executorch') as ExecutorchExports;
  } catch {
    _exec = null;
  }
  return _exec;
};

const tryInitExecutorch = (exec: ExecutorchExports): void => {
  if (_execInited) return;
  if (!exec.initExecutorch) {
    _execInited = true; // older versions may not need it
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fetcher = require('react-native-executorch-expo-resource-fetcher') as {
      ExpoResourceFetcher?: unknown;
    };
    if (fetcher.ExpoResourceFetcher) {
      exec.initExecutorch({ resourceFetcher: fetcher.ExpoResourceFetcher });
      _execInited = true;
    }
  } catch {
    // No resource fetcher available — try without one. Some versions accept
    // a default. If init fails, MiniLmEmbedder.load() falls through to the
    // factory's hash fallback.
    try {
      exec.initExecutorch({ resourceFetcher: undefined });
      _execInited = true;
    } catch {
      // give up — load() will return false and we'll fall back
    }
  }
};

export class MiniLmEmbedder implements Embedder {
  readonly name = MINILM_EMBEDDER_NAME;
  readonly dim = MINILM_DIM;

  private module: TextEmbeddingsModule | null = null;
  private loadFailed = false;

  isReady(): boolean {
    return this.module !== null;
  }

  async load(opts?: { onDownloadProgress?: (pct: number) => void }): Promise<boolean> {
    if (this.module) return true;
    if (this.loadFailed) return false;
    const exec = tryRequireExecutorch();
    if (!exec || !exec.TextEmbeddingsModule || !exec.ALL_MINILM_L6_V2 || !exec.ALL_MINILM_L6_V2_TOKENIZER) {
      this.loadFailed = true;
      return false;
    }
    tryInitExecutorch(exec);
    try {
      this.module = await exec.TextEmbeddingsModule.fromCustomModel(
        exec.ALL_MINILM_L6_V2,
        exec.ALL_MINILM_L6_V2_TOKENIZER,
        opts?.onDownloadProgress
      );
      return true;
    } catch {
      this.loadFailed = true;
      return false;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.module) {
      throw new Error('MiniLmEmbedder not loaded — call load() first');
    }
    const out = await this.module.forward(text);
    // forward() returns Float32Array on device; normalize to plain array for
    // JSON storage. Already L2-normalized by the model in MiniLM checkpoints.
    return Array.from(out);
  }

  async unload(): Promise<void> {
    if (this.module) {
      try {
        this.module.delete();
      } catch {
        /* swallow — unload is best-effort */
      }
      this.module = null;
    }
  }
}
