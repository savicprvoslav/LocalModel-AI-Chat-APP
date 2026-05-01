import type { Tool } from './types';
import { calculatorTool } from './calculator';
import { currentTimeTool } from './currentTime';
import { searchConversationsTool } from './searchConversations';
import { webSearchTool } from './webSearch';

/**
 * The full catalog of tools the app knows about. The runtime registry
 * (which the model actually sees) is filtered down by the user's
 * settings — see {@link enabledTools}.
 */
export const ALL_TOOLS: Tool[] = [
  calculatorTool,
  currentTimeTool,
  searchConversationsTool,
  webSearchTool
];

export type ToolsConfig = {
  /** Master gate. When false, tools are not advertised to the model at all. */
  tools_enabled: boolean;
  /** Per-tool toggles, keyed by Tool.id. Missing key = enabled by default
   *  for non-network tools, disabled for network tools. */
  per_tool: Record<string, boolean>;
};

export const DEFAULT_TOOLS_CONFIG: ToolsConfig = {
  tools_enabled: false,
  per_tool: {}
};

const isToolEnabled = (tool: Tool, cfg: ToolsConfig): boolean => {
  if (!cfg.tools_enabled) return false;
  if (tool.id in cfg.per_tool) return cfg.per_tool[tool.id] === true;
  // Default: local tools on, network tools off (privacy default).
  return !tool.network;
};

export const enabledTools = (cfg: ToolsConfig): Tool[] =>
  ALL_TOOLS.filter((t) => isToolEnabled(t, cfg));

export const findTool = (id: string): Tool | undefined =>
  ALL_TOOLS.find((t) => t.id === id);
