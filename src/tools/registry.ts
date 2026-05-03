import type { Tool } from './types';
import { calculatorTool } from './calculator';
import { currentTimeTool } from './currentTime';
import { webSearchTool } from './webSearch';
import { httpRequestTool } from './httpRequest';
import { fetchUrlTool } from './fetchUrl';
import { weatherTool } from './weather';

/**
 * Tool catalog — five generic primitives the model can compose.
 *
 * The PRD originally suggested per-service tools (calendar.search,
 * email.create_draft, reminder.create, etc.). Those each need a real iOS
 * native bridge. Instead we ship generic primitives and let the model
 * orchestrate them:
 *
 *   web_search → fetch_url → http_request(POST, webhook)
 *
 * Any service that exposes an HTTP API (Slack, Notion, Linear, IFTTT,
 * Zapier, your own backend) is reachable via `http_request` without us
 * shipping a dedicated native bridge per service.
 *
 * Note: `searchConversations` was removed — conversation-history retrieval
 * runs through the RAG layer (`src/integration/rag.ts`), so we don't expose
 * two parallel paths to the model.
 */
export const ALL_TOOLS: Tool[] = [
  calculatorTool,
  currentTimeTool,
  weatherTool,
  webSearchTool,
  fetchUrlTool,
  httpRequestTool
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
