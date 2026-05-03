/**
 * Lazy loader for dev-time API keys.
 *
 * Reads `secrets.local.ts` (gitignored) if it exists. If a developer hasn't
 * set up local secrets, the getters return `undefined` and the consuming
 * tool surfaces a friendly "API key not configured" error rather than
 * silently making unauthenticated calls.
 *
 * Production replacement: a Settings screen that lets the user enter their
 * own keys, persisted in SQLite (encrypted at rest by iOS data protection).
 */
type DevSecrets = {
  serperApiKey?: string;
  openWeatherMapApiKey?: string;
};

let cached: DevSecrets | null = null;

const load = (): DevSecrets => {
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./secrets.local') as { DEV_SECRETS?: DevSecrets };
    cached = mod.DEV_SECRETS ?? {};
  } catch {
    cached = {};
  }
  return cached;
};

export const getSerperApiKey = (): string | undefined => load().serperApiKey;
export const getOpenWeatherMapApiKey = (): string | undefined => load().openWeatherMapApiKey;
