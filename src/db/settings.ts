import { getDb } from './db';

export type Theme = 'system' | 'light' | 'dark';

/** Per-tool on/off flags keyed by Tool.id. Missing keys take a sensible
 *  default: local tools on, network tools off. */
export type ToolsPerToolMap = Record<string, boolean>;

export type Settings = {
  active_model_id: string | null;
  temperature: number;
  max_tokens: number;
  context_window: number;
  theme: Theme;
  /** Eagerly load the active model on app launch so the first message
   *  doesn't pay warmup latency. Costs RAM continuously while app is open. */
  prewarm_on_launch: boolean;
  /** When on, retrieval-augmented generation pulls relevant snippets from
   *  past conversations into each prompt. */
  retrieval_enabled: boolean;
  /** Max snippets to inject per send. */
  retrieval_k: number;
  /** Master switch for AI tools (calculator, web search, etc.). Off by
   *  default — turning it on advertises the registered tools to the model
   *  in the system prompt. */
  tools_enabled: boolean;
  /** Per-tool overrides for {@link ToolsPerToolMap}. */
  tools_per_tool: ToolsPerToolMap;
  /** Hard cap on consecutive tool calls per assistant turn — prevents
   *  runaway loops if the model keeps re-invoking tools. */
  tools_max_iterations: number;
};

export const DEFAULT_SETTINGS: Settings = {
  active_model_id: null,
  temperature: 0.7,
  max_tokens: 1024,
  context_window: 4096,
  theme: 'system',
  prewarm_on_launch: false,
  retrieval_enabled: true,
  retrieval_k: 4,
  tools_enabled: false,
  tools_per_tool: {},
  tools_max_iterations: 3
};

export const getSetting = async <K extends keyof Settings>(key: K): Promise<Settings[K]> => {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  if (!row) return DEFAULT_SETTINGS[key];
  return JSON.parse(row.value) as Settings[K];
};

export const setSetting = async <K extends keyof Settings>(
  key: K,
  value: Settings[K]
): Promise<void> => {
  await getDb().runAsync(
    'INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)',
    key,
    JSON.stringify(value)
  );
};

export const getAllSettings = async (): Promise<Settings> => {
  const rows = await getDb().getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) {
      (out as Record<string, unknown>)[r.key] = JSON.parse(r.value);
    }
  }
  return out;
};
