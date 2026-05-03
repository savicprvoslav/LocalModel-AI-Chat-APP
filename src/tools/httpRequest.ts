import type { Tool } from './types';

/**
 * Generic HTTP request primitive — the building block users can compose for
 * "search → POST to webhook" style flows without us building per-service
 * native bridges.
 *
 * Safety stance:
 *  - GET / HEAD: executed directly. Read-only.
 *  - POST / PUT / DELETE / PATCH: not yet executed by this MVP. Returns an
 *    explicit error so the model knows to abandon. Destructive HTTP needs a
 *    user-facing confirmation card before we execute it; that UI is on the
 *    roadmap (see PRD section on confirmation flow).
 *
 * The `headers` parameter is a JSON object encoded as a string (the prompt
 * schema only knows primitive types, so we serialize). We parse + validate
 * before issuing the request.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD']);

const parseHeaders = (raw: unknown): Record<string, string> => {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw as Record<string, string>;
  if (typeof raw !== 'string') {
    throw new Error('headers must be a JSON object or JSON string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('headers must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('headers must be a JSON object');
  }
  return parsed as Record<string, string>;
};

export const httpRequestTool: Tool = {
  id: 'http_request',
  name: 'HTTP Request',
  description:
    'Make an HTTP request to any URL. Read-only methods (GET, HEAD) are executed immediately. Write methods (POST, PUT, DELETE, PATCH) are not yet supported in this MVP — they will require a user confirmation step.',
  network: true,
  params: [
    { name: 'url', type: 'string', required: true, description: 'Absolute URL to call.' },
    {
      name: 'method',
      type: 'string',
      required: false,
      description: 'HTTP method. Defaults to GET. Only GET and HEAD are executed today.'
    },
    {
      name: 'headers',
      type: 'string',
      required: false,
      description:
        'Optional headers as a JSON object string, e.g. {"Authorization":"Bearer ..."}.'
    },
    {
      name: 'body',
      type: 'string',
      required: false,
      description: 'Optional request body. Only relevant for non-GET methods.'
    }
  ],
  run: async (args, ctx) => {
    const url = String(args.url ?? '').trim();
    if (!url) return 'ERROR: missing required arg "url"';

    const method = String(args.method ?? 'GET').toUpperCase();
    if (!SAFE_METHODS.has(method)) {
      return `ERROR: method ${method} not yet supported. This MVP only allows GET and HEAD until the confirmation UI lands.`;
    }

    let headers: Record<string, string>;
    try {
      headers = parseHeaders(args.headers);
    } catch (e) {
      return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    const onParentAbort = () => controller.abort();
    ctx.signal?.addEventListener('abort', onParentAbort);

    try {
      const res = await fetch(url, { method, headers, signal: controller.signal });
      const text = await res.text();
      const trimmed = text.length > 8192 ? `${text.slice(0, 8192)}\n…[truncated]` : text;
      return JSON.stringify({
        status: res.status,
        ok: res.ok,
        url: res.url,
        body: trimmed
      });
    } catch (e) {
      return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', onParentAbort);
    }
  }
};
