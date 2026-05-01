import type { ToolCall } from './types';

/**
 * Tool-call wire format the model is taught to emit:
 *
 *   <tool_call>{"name": "web_search", "args": {"query": "..."}}</tool_call>
 *
 * Why this shape:
 *  - A single explicit open/close tag is robust during streaming detection
 *    (we just watch the buffer for "</tool_call>").
 *  - JSON body keeps args structured without bespoke parsing.
 *  - "name" + "args" mirrors the OpenAI / Anthropic tool-call shape so the
 *    model has likely seen this style during instruction tuning.
 */
const OPEN = '<tool_call>';
const CLOSE = '</tool_call>';

const tryParseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/**
 * Find every tool-call block in `text` and return them in order.
 * Malformed blocks (bad JSON, missing name) are skipped silently — the
 * caller will continue generation and may produce a corrected call.
 */
export const parseToolCalls = (text: string): ToolCall[] => {
  const out: ToolCall[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf(OPEN, cursor);
    if (open === -1) break;
    const close = text.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) break;
    const body = text.slice(open + OPEN.length, close).trim();
    const raw = text.slice(open, close + CLOSE.length);
    cursor = close + CLOSE.length;

    const parsed = tryParseJson(body);
    if (!parsed || typeof parsed !== 'object') continue;
    const obj = parsed as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : null;
    if (!name) continue;
    const argsValue = obj.args;
    const args =
      argsValue && typeof argsValue === 'object' && !Array.isArray(argsValue)
        ? (argsValue as Record<string, unknown>)
        : {};
    out.push({ name, args, raw });
  }
  return out;
};

/**
 * True if the buffer contains a complete tool call (open + matching close).
 * Used by the streaming loop to decide when to abort and execute.
 */
export const containsCompleteToolCall = (text: string): boolean => {
  const open = text.indexOf(OPEN);
  if (open === -1) return false;
  return text.indexOf(CLOSE, open + OPEN.length) !== -1;
};

export const TOOL_CALL_OPEN = OPEN;
export const TOOL_CALL_CLOSE = CLOSE;
export const TOOL_RESULT_OPEN = '<tool_result>';
export const TOOL_RESULT_CLOSE = '</tool_result>';

/** Render a tool result block in the same shape the model produced its call. */
export const formatToolResult = (
  callRaw: string,
  result: string,
  error?: string
): string => {
  const body = error ? `ERROR: ${error}` : result;
  return `${callRaw}\n${TOOL_RESULT_OPEN}\n${body}\n${TOOL_RESULT_CLOSE}\n`;
};
