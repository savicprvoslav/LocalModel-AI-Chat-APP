import type { Tool } from './types';

/**
 * Fetch a URL and return readable text. Companion to `web_search`: search
 * gives titles + snippets, this lets the model pull the body of the result
 * it cares about so it can ground a longer answer in actual content.
 *
 * Strips HTML tags and scripts/styles. Caps response at 16KB so a giant
 * article doesn't blow the context window.
 */
const stripHtml = (html: string): string => {
  // Remove script/style blocks entirely (their contents are noise).
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Replace tags with whitespace so words don't collide.
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode the most common HTML entities. Full decode would need a
  // dependency; this covers ~95% of real text.
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

const MAX_BODY = 16_384;

export const fetchUrlTool: Tool = {
  id: 'fetch_url',
  name: 'Fetch URL',
  description:
    'Download a URL and return its readable text content (HTML stripped, capped at ~16KB). Use after `web_search` when you need to read the actual page, not just the snippet.',
  network: true,
  params: [
    { name: 'url', type: 'string', required: true, description: 'Absolute URL to fetch.' }
  ],
  run: async (args, ctx) => {
    const url = String(args.url ?? '').trim();
    if (!url) return 'ERROR: missing required arg "url"';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    if (ctx.signal) {
      ctx.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        // A real UA helps with sites that 403 unknown clients.
        headers: { 'User-Agent': 'Mozilla/5.0 LocalChat/0.1' },
        signal: controller.signal
      });
      if (!res.ok) {
        return `ERROR: HTTP ${res.status} for ${url}`;
      }
      const ct = res.headers.get('content-type') ?? '';
      const raw = await res.text();
      const text = ct.includes('html') ? stripHtml(raw) : raw;
      return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n…[truncated]` : text;
    } catch (e) {
      return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(timer);
    }
  }
};
