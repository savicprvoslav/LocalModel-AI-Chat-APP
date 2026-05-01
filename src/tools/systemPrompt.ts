import type { Tool } from './types';
import { TOOL_CALL_OPEN, TOOL_CALL_CLOSE, TOOL_RESULT_OPEN, TOOL_RESULT_CLOSE } from './parser';

const formatParam = (p: { name: string; type: string; required: boolean; description: string }): string =>
  `    - ${p.name} (${p.type}${p.required ? '' : ', optional'}): ${p.description}`;

const formatTool = (t: Tool): string => {
  const head = `- ${t.id}: ${t.description}`;
  if (t.params.length === 0) return head;
  const lines = [head, '  parameters:'];
  for (const p of t.params) lines.push(formatParam(p));
  return lines.join('\n');
};

/**
 * Render the "TOOLS" section of the system prompt.
 *
 * The wire-format example uses a non-existent example tool so we don't
 * confuse the model into thinking it has more tools than it does.
 */
export const renderToolsBlock = (tools: Tool[]): string => {
  if (tools.length === 0) return '';
  const lines: string[] = [];
  lines.push('TOOLS YOU CAN CALL:');
  for (const t of tools) lines.push(formatTool(t));
  lines.push('');
  lines.push('TOOL CALL FORMAT — when you need a tool, output exactly:');
  lines.push(`${TOOL_CALL_OPEN}{"name": "<tool_id>", "args": {"<param>": "<value>"}}${TOOL_CALL_CLOSE}`);
  lines.push(
    'After you emit a tool call, stop generating. The result will be returned as:'
  );
  lines.push(`${TOOL_RESULT_OPEN}…${TOOL_RESULT_CLOSE}`);
  lines.push(
    'Then continue your reply, using the result. Only call tools when they meaningfully help; otherwise answer directly. Never invent tool ids.'
  );
  return lines.join('\n');
};
