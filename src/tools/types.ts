/**
 * Tools the model can invoke during generation.
 *
 * Tool calls are surfaced via prompt engineering — the system prompt
 * advertises what's available, the model emits a `<tool_call>` block,
 * we run it locally, and feed the result back as a `<tool_result>` block
 * for the next generation step.
 *
 * No native tool/function-calling API is assumed; this works against any
 * instruction-tuned model.
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
  /** The exact substring of the assistant message containing the call,
   *  including the surrounding tags. Used to splice in the result. */
  raw: string;
};

export type ToolInvocation = {
  call: ToolCall;
  result: string;
  error?: string;
  durationMs: number;
};
