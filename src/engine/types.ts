export type Role = 'system' | 'user' | 'assistant';
export type ChatTurn = { role: Role; content: string };

export type GenerationOptions = {
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
};

export type FinishReason = 'stop' | 'length';

export type StreamCallbacks = {
  onToken: (text: string) => void;
  onDone: (info: { tokenCount: number; finishReason: FinishReason }) => void;
  onError: (err: Error) => void;
};

export type LoadProgress = { phase: 'mmap' | 'warmup'; percent: number };

export type EmbedResult = { vector: number[]; embedder: string };

export interface ChatEngine {
  isReady(): boolean;
  load(modelPath: string, opts?: { onProgress?: (p: LoadProgress) => void }): Promise<void>;
  dispose(): Promise<void>;
  streamCompletion(
    prompt: string,
    options: GenerationOptions,
    cb: StreamCallbacks
  ): Promise<void>;
  /**
   * Produce a vector embedding of `text`. Implementations may use a real
   * model (e.g., a separate embedding-mode llama context, or ONNX) or a
   * deterministic fallback (feature hashing). The `embedder` field
   * identifies which scheme was used so callers can avoid mixing schemes.
   */
  embed(text: string): Promise<EmbedResult>;
  getContextLength?(): number;
}
