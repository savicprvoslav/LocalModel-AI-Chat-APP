export type Role = 'system' | 'user' | 'assistant' | 'tool';
export type ChatTurn = { role: Role; content: string };

/**
 * OpenAI-compatible message shape consumed by `streamCompletion`. The engine
 * passes these through to llama.rn, which renders them via the model's own
 * Jinja chat template — no hand-rolled `<|user|>` markers in JS.
 *
 * `tool` messages carry the result of a tool call back to the model. `name`
 * holds the tool id; `tool_call_id` echoes the id the model used so the
 * template can pair calls and results.
 */
export type ChatMessage = {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type GenerationOptions = {
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
};

export type FinishReason = 'stop' | 'length';

export type StreamCallbacks = {
  onToken: (text: string) => void;
  /**
   * Fired once when the engine has parsed one or more structured tool calls
   * from the model output (via llama.rn's native tool API). The caller is
   * expected to run each tool, append `{role:'tool'}` messages, and call
   * `streamCompletion` again to let the model continue with the results.
   */
  onToolCalls?: (calls: ToolCallEvent[]) => void;
  onDone: (info: { tokenCount: number; finishReason: FinishReason }) => void;
  onError: (err: Error) => void;
};

export type LoadProgress = { phase: 'mmap' | 'warmup'; percent: number };

/**
 * OpenAI-compatible function-tool spec. Passed through llama.rn's `tools`
 * parameter; the engine renders these into the model's native tool-call
 * format via the chat template, and parses model output back into
 * structured `ToolCallEvent`s. Mirrors the shape that GPT / Anthropic /
 * Qwen / Llama 3 chat APIs all converge on.
 */
export type ToolSpec = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
  };
};

export type ToolCallEvent = {
  /** Tool id the model wants to invoke (matches Tool.id in our registry). */
  name: string;
  /** Parsed JSON arguments. May be `{}` if the model called with no args. */
  args: Record<string, unknown>;
  /** llama.rn-issued id, echoed back when we send the result. */
  id?: string;
};

export type StreamInput = {
  /** Conversation as a list of role-tagged messages. */
  messages: ChatMessage[];
  /**
   * Optional partial assistant text to continue from. When set, the engine
   * formats the messages, then appends this as the start of the assistant's
   * reply and resumes generation. Used by the tool-call iteration loop to
   * stream more tokens after substituting tool results into the buffer.
   */
  prefillText?: string;
  /**
   * Tools the model is allowed to call this turn. The engine forwards these
   * to llama.rn's native tool-calling path so each model uses its trained
   * format (Qwen ChatML, Llama 3.x JSON, etc.). Empty/undefined disables
   * tool calling for the turn.
   */
  tools?: ToolSpec[];
};

export interface ChatEngine {
  isReady(): boolean;
  load(modelPath: string, opts?: { onProgress?: (p: LoadProgress) => void }): Promise<void>;
  dispose(): Promise<void>;
  streamCompletion(
    input: StreamInput,
    options: GenerationOptions,
    cb: StreamCallbacks
  ): Promise<void>;
  getContextLength?(): number;
}
