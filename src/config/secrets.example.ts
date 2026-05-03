/**
 * Shape for `secrets.local.ts` (which is gitignored).
 *
 * Each developer keeps their own API keys in `secrets.local.ts` next to this
 * file. To get started, copy this file to `secrets.local.ts` and fill in the
 * real values. The runtime imports `./secrets` (see `secrets.ts`), which
 * loads `secrets.local.ts` if present and otherwise falls back to undefined.
 *
 * This is a development-only convenience. The proper home for user-supplied
 * keys is a Settings UI that writes to encrypted SQLite — see the PRD.
 */
export const DEV_SECRETS = {
  /** Serper.dev API key for `web_search` tool. https://serper.dev */
  serperApiKey: 'YOUR_SERPER_KEY_HERE',
  /** OpenWeatherMap API key for `weather` tool. https://openweathermap.org/api */
  openWeatherMapApiKey: 'YOUR_OWM_KEY_HERE'
} as const;
