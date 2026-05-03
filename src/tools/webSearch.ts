import type { Tool } from './types';
import { getSerperApiKey } from '@/config/secrets';

/**
 * Web search via Serper.dev (Google search results as JSON).
 *
 * Why Serper:
 *  - Reliable Google-quality results with snippets and titles.
 *  - One API key, generous free tier.
 *  - JSON response — no HTML scraping or fragile selectors.
 *
 * The API key is loaded from the local secrets file (gitignored). If a
 * developer hasn't configured one, the tool returns a clear error rather
 * than silently failing — the model can then choose to skip the search.
 */

type SerperOrganic = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
};

type SerperResponse = {
  organic?: SerperOrganic[];
  answerBox?: { answer?: string; snippet?: string; title?: string };
  knowledgeGraph?: { title?: string; description?: string };
};

const formatResults = (data: SerperResponse, query: string): string => {
  const parts: string[] = [];
  if (data.answerBox?.answer || data.answerBox?.snippet) {
    parts.push(`Answer: ${data.answerBox.answer ?? data.answerBox.snippet}`);
  }
  if (data.knowledgeGraph?.description) {
    parts.push(
      `${data.knowledgeGraph.title ?? ''}: ${data.knowledgeGraph.description}`.trim()
    );
  }
  const top = (data.organic ?? []).slice(0, 5);
  if (top.length > 0) {
    parts.push('Top results:');
    for (const r of top) {
      const title = (r.title ?? '').trim();
      const snippet = (r.snippet ?? '').trim();
      const link = r.link ? ` (${r.link})` : '';
      parts.push(`- ${title}${link}\n  ${snippet}`);
    }
  }
  if (parts.length === 0) {
    return `No results for "${query}". Try rephrasing.`;
  }
  return parts.join('\n');
};

export const webSearchTool: Tool = {
  id: 'web_search',
  name: 'Web search',
  description:
    'Search the public web (Google results via Serper). Returns titles, snippets, and links for the top hits. Use for facts you do not know or that may be out of date.',
  params: [
    {
      name: 'query',
      type: 'string',
      required: true,
      description: 'Plain-language search query, like "current population of Tokyo".'
    }
  ],
  network: true,
  run: async (args, ctx) => {
    const query = args.query;
    if (typeof query !== 'string' || !query.trim()) {
      throw new Error('web_search: missing string `query`');
    }
    const apiKey = getSerperApiKey();
    if (!apiKey) {
      return 'ERROR: web_search requires a Serper API key. See src/config/secrets.example.ts for setup.';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    const onParentAbort = () => controller.abort();
    ctx.signal?.addEventListener('abort', onParentAbort);
    try {
      const resp = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: query }),
        signal: controller.signal
      });
      if (!resp.ok) {
        throw new Error(`Serper HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as SerperResponse;
      return formatResults(data, query);
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', onParentAbort);
    }
  }
};
