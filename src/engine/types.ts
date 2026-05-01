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

export interface ChatEngine {
  isReady(): boolean;
  load(modelPath: string, opts?: { onProgress?: (p: LoadProgress) => void }): Promise<void>;
  dispose(): Promise<void>;
  streamCompletion(
    prompt: string,
    options: GenerationOptions,
    cb: StreamCallbacks
  ): Promise<void>;
  getContextLength?(): number;
  /**
   * Whether the active model + engine pair can read image inputs. Engines
   * default to false (text-only). Vision-capable engines (e.g. a future
   * llama.cpp build with mmproj support, or LiteRT-LM Multimodal) override.
   *
   * When false, useConversation will:
   *   - allow the user to attach images (for record-keeping)
   *   - emit a one-line note in the prompt that an image was attached but
   *     the active model can't see it
   */
  supportsVision?(): boolean;
}
