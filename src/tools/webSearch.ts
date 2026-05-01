import type { Tool } from './types';

/**
 * Web search via DuckDuckGo's Instant Answer API.
 *
 * Why this provider:
 *  - No API key. No account.
 *  - JSON-only response, no HTML scraping.
 *  - Returns abstract, definition, and related topics — enough for the
 *    model to ground a short answer.
 *
 * Privacy note: this is the ONLY tool that hits the network. It is
 * gated by both `tools_enabled` and `tools_web_search_enabled` so the
 * default install stays fully offline.
 */

type DDGRelatedTopic = {
  Text?: string;
  FirstURL?: string;
  Result?: string;
  Topics?: DDGRelatedTopic[];
};

type DDGResponse = {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  Answer?: string;
  Definition?: string;
  DefinitionURL?: string;
  RelatedTopics?: DDGRelatedTopic[];
};

const flattenTopics = (topics: DDGRelatedTopic[] | undefined): DDGRelatedTopic[] => {
  if (!topics) return [];
  const out: DDGRelatedTopic[] = [];
  for (const t of topics) {
    if (t.Topics && Array.isArray(t.Topics)) {
      out.push(...flattenTopics(t.Topics));
    } else if (t.Text) {
      out.push(t);
    }
  }
  return out;
};

export const formatSearchResult = (data: DDGResponse, query: string): string => {
  const parts: string[] = [];
  if (data.Heading) parts.push(`# ${data.Heading}`);
  if (data.Answer) parts.push(`Answer: ${data.Answer}`);
  if (data.AbstractText) {
    parts.push(data.AbstractText);
    if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
  } else if (data.Definition) {
    parts.push(data.Definition);
    if (data.DefinitionURL) parts.push(`Source: ${data.DefinitionURL}`);
  }
  const related = flattenTopics(data.RelatedTopics).slice(0, 5);
  if (related.length > 0) {
    parts.push('Related:');
    for (const t of related) {
      const text = (t.Text ?? '').trim();
      if (!text) continue;
      const url = t.FirstURL ? ` (${t.FirstURL})` : '';
      parts.push(`- ${text}${url}`);
    }
  }
  if (parts.length === 0) {
    return `No DuckDuckGo instant answer for "${query}". Try rephrasing.`;
  }
  return parts.join('\n');
};

export const webSearchTool: Tool = {
  id: 'web_search',
  name: 'Web search',
  description:
    'Search the public web via DuckDuckGo. Returns a short abstract plus related links. Use for facts you do not know or that may be out of date.',
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
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    const onParentAbort = () => controller.abort();
    ctx.signal?.addEventListener('abort', onParentAbort);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as DDGResponse;
      return formatSearchResult(data, query);
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', onParentAbort);
    }
  }
};
