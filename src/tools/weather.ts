import type { Tool } from './types';
import { getOpenWeatherMapApiKey } from '@/config/secrets';

/**
 * Current weather lookup via OpenWeatherMap.
 *
 * Why a dedicated tool instead of leaving this to `web_search`:
 *  - Models reliably know what "weather" is and emit a `location` arg
 *    instead of guessing a search query.
 *  - Returns a small structured summary, easy for the model to integrate
 *    into a one-line answer.
 *  - Free tier (60 req/min) is plenty for personal use.
 *
 * Endpoint:
 *   https://api.openweathermap.org/data/2.5/weather?q={location}&appid={key}&units=metric
 */

type OWMResponse = {
  name?: string;
  sys?: { country?: string };
  main?: { temp?: number; feels_like?: number; humidity?: number; pressure?: number };
  weather?: Array<{ main?: string; description?: string }>;
  wind?: { speed?: number; deg?: number };
  visibility?: number;
  cod?: number | string;
  message?: string;
};

const formatResult = (data: OWMResponse): string => {
  if (data.cod && Number(data.cod) !== 200) {
    return `ERROR: ${data.message ?? 'OpenWeatherMap returned an error'}`;
  }
  const place = data.name
    ? `${data.name}${data.sys?.country ? `, ${data.sys.country}` : ''}`
    : 'unknown location';
  const w = data.weather?.[0];
  const conditions = w?.description ?? w?.main ?? 'unknown';
  const temp = data.main?.temp;
  const feels = data.main?.feels_like;
  const humidity = data.main?.humidity;
  const wind = data.wind?.speed;

  const parts = [`Weather in ${place}: ${conditions}.`];
  if (typeof temp === 'number') {
    const feelsTxt =
      typeof feels === 'number' && Math.abs(feels - temp) >= 1
        ? ` (feels like ${Math.round(feels)}°C)`
        : '';
    parts.push(`Temperature ${Math.round(temp)}°C${feelsTxt}.`);
  }
  if (typeof humidity === 'number') parts.push(`Humidity ${humidity}%.`);
  if (typeof wind === 'number') parts.push(`Wind ${Math.round(wind)} m/s.`);
  return parts.join(' ');
};

export const weatherTool: Tool = {
  id: 'weather',
  name: 'Weather',
  description:
    'Get the current weather for a city or location. Returns temperature, conditions, humidity, and wind speed in metric units.',
  network: true,
  params: [
    {
      name: 'location',
      type: 'string',
      required: true,
      description:
        'City name, optionally with country code, e.g. "Belgrade", "Belgrade,RS", "New York,US".'
    }
  ],
  run: async (args, ctx) => {
    const location = String(args.location ?? '').trim();
    if (!location) return 'ERROR: missing required arg "location"';

    const apiKey = getOpenWeatherMapApiKey();
    if (!apiKey) {
      return 'ERROR: weather tool requires an OpenWeatherMap API key. See src/config/secrets.example.ts.';
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    const onParentAbort = () => controller.abort();
    ctx.signal?.addEventListener('abort', onParentAbort);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      const data = (await resp.json()) as OWMResponse;
      if (!resp.ok) {
        return `ERROR: OpenWeatherMap HTTP ${resp.status} — ${data.message ?? resp.statusText}`;
      }
      return formatResult(data);
    } catch (e) {
      return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', onParentAbort);
    }
  }
};
