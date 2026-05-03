import type { Tool, ToolParam } from './types';
import type { ToolSpec } from '@/engine/types';

/**
 * Convert our internal `Tool` type into the OpenAI-compatible `ToolSpec`
 * shape that llama.rn's native tool-calling API expects.
 *
 * Why this layer exists:
 *  - Our `Tool.params` uses primitive type tags (`'string' | 'number' | …`)
 *    optimized for prompt rendering. The OpenAI shape is JSON-schema-like
 *    and is what every modern instruct model has been trained against
 *    (Qwen ChatML, Llama 3 tools, GPT, etc.).
 *  - llama.rn's chat template substitutes a model-specific representation
 *    of the tools at prompt time, so we don't have to hand-roll a TOOLS
 *    block per model.
 */
const PARAM_TYPE_MAP: Record<ToolParam['type'], string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean'
};

export const toolToOpenAISpec = (t: Tool): ToolSpec => {
  const properties: ToolSpec['function']['parameters']['properties'] = {};
  const required: string[] = [];
  for (const p of t.params) {
    properties[p.name] = {
      type: PARAM_TYPE_MAP[p.type] ?? 'string',
      ...(p.description ? { description: p.description } : {})
    };
    if (p.required) required.push(p.name);
  }
  return {
    type: 'function',
    function: {
      name: t.id,
      description: t.description,
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {})
      }
    }
  };
};

export const toolsToOpenAISpecs = (tools: Tool[]): ToolSpec[] =>
  tools.map(toolToOpenAISpec);
