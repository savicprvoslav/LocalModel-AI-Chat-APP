import type { Message } from '@/db/messages';
import { getEngine } from '@/engine';

export type ProposedEntity = { name: string; description: string };

const EXTRACTION_PROMPT = `You read a conversation and extract any people, places, projects, products, or significant recurring concepts that the user might want the assistant to remember about this project in future conversations.

OUTPUT FORMAT — strict:
- One ENTITY per line.
- Each line: ENTITY: <name> | <one-line description>
- No preamble, no explanation, no bullets, no headings.
- If nothing notable appears, output a single line: NONE

Only output information stated or strongly implied in the conversation. Do not invent. Skip generic terms (e.g. "the user", "the team") with no specific identity.

Examples:
ENTITY: Tom Reyes | backend engineer worried about Q4 timeline
ENTITY: Acme Cloud | the customer's primary product, runs on Postgres
ENTITY: Postgres migration | scoped for Q1, blocked on schema review

CONVERSATION:
`;

const formatHistory = (messages: Message[]): string => {
  return messages
    .filter((m) => m.role !== 'system' && m.content.trim().length > 0)
    .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content.trim()}`)
    .join('\n\n');
};

const ENTITY_LINE_RE = /^ENTITY:\s*(.+?)\s*\|\s*(.+)$/i;

export const parseExtractedEntities = (raw: string): ProposedEntity[] => {
  const out: ProposedEntity[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^NONE\b/i.test(trimmed)) continue;
    const m = ENTITY_LINE_RE.exec(trimmed);
    if (!m) continue;
    const name = m[1]!.trim();
    const description = m[2]!.trim();
    if (!name || !description) continue;
    out.push({ name, description });
  }
  return out;
};

export const dedupeAgainstExisting = (
  proposed: ProposedEntity[],
  existing: Array<{ name: string }>
): ProposedEntity[] => {
  const existingLower = new Set(existing.map((e) => e.name.toLowerCase()));
  const seenLower = new Set<string>();
  const out: ProposedEntity[] = [];
  for (const p of proposed) {
    const key = p.name.toLowerCase();
    if (existingLower.has(key) || seenLower.has(key)) continue;
    seenLower.add(key);
    out.push(p);
  }
  return out;
};

/**
 * Run extraction against the loaded engine. Returns proposed entities.
 * Caller is responsible for ensuring the engine is loaded; will throw if not.
 */
export const extractEntities = async (
  messages: Message[],
  options: { signal?: AbortSignal; maxTokens?: number } = {}
): Promise<ProposedEntity[]> => {
  const engine = getEngine();
  if (!engine.isReady()) throw new Error('engine not loaded');
  const prompt = `${EXTRACTION_PROMPT}${formatHistory(messages)}\n\nENTITIES:\n`;

  let buffer = '';
  await engine.streamCompletion(
    prompt,
    {
      temperature: 0.2,
      maxTokens: options.maxTokens ?? 512,
      ...(options.signal ? { signal: options.signal } : {})
    },
    {
      onToken: (t) => {
        buffer += t;
      },
      onDone: () => undefined,
      onError: (err) => {
        if (err.name !== 'AbortError') throw err;
      }
    }
  );

  return parseExtractedEntities(buffer);
};
