import type { Tool, ToolCall, ToolContext, ToolInvocation } from './types';

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Execute a tool call. Catches handler errors so the conversation can
 * surface a `<tool_result>ERROR: ...</tool_result>` to the model and let
 * it self-correct on the next pass.
 */
export const runToolCall = async (
  tool: Tool,
  call: ToolCall,
  ctxOverride?: Partial<ToolContext>
): Promise<ToolInvocation> => {
  const ctx: ToolContext = {
    timeoutMs: ctxOverride?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(ctxOverride?.signal ? { signal: ctxOverride.signal } : {})
  };
  const started = Date.now();
  try {
    const result = await tool.run(call.args, ctx);
    return { call, result, durationMs: Date.now() - started };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { call, result: '', error: err, durationMs: Date.now() - started };
  }
};
