import { getDb } from './db';

export type Theme = 'system' | 'light' | 'dark';

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
};

export const DEFAULT_SETTINGS: Settings = {
  active_model_id: null,
  temperature: 0.7,
  max_tokens: 1024,
  context_window: 4096,
  theme: 'system',
  prewarm_on_launch: false,
  retrieval_enabled: true,
  retrieval_k: 4
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
