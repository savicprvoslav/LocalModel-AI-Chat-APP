/**
 * Tools the model can invoke during generation.
 *
 * Tool specs are converted to OpenAI-compatible JSON schemas (see
 * `openaiSpec.ts`) and passed to llama.rn's native tool-calling API.
 * Each model's Jinja chat template renders the tools in its trained
 * format (Qwen ChatML, Llama 3.x, etc.) and parses structured
 * `ToolCallEvent`s from the output.
 */

export type ToolParam = {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
};

export type ToolContext = {
  /** Hard timeout for any single network or DB request. Tools should respect. */
  timeoutMs: number;
  /** Abort propagation from the conversation controller. */
  signal?: AbortSignal;
};

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext
) => Promise<string>;

export type Tool = {
  /** Canonical id; used in the prompt and persisted in tool_calls. */
  id: string;
  /** Human-readable name shown in UI. */
  name: string;
  /** One-line description shown to the model. */
  description: string;
  params: ToolParam[];
  /**
   * Whether this tool reaches the network. Surfaced in UI and gated by a
   * separate `tools_network_enabled` setting so the privacy promise stays
   * crisp: tools are off by default, network tools require an extra opt-in.
   */
  network: boolean;
  run: ToolHandler;
};

export type ToolCall = {
  /** The tool id the model asked for. */
  name: string;
  /** Parsed JSON args (raw {} if none). */
  args: Record<string, unknown>;
};

export type ToolInvocation = {
  call: ToolCall;
  result: string;
  error?: string;
  durationMs: number;
};
