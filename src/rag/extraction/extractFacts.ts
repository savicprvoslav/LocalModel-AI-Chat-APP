import type { ConvMessage, Fact, LlmAdapter, ProposedFact } from '../types';
import type { FactStore } from '../storage/types';

/**
 * Prompt the LLM to lift recall-worthy facts out of a conversation. The
 * intent is broad: people the user mentions, relationships, ages,
 * preferences, locations, ongoing situations, projects, products. The
 * model decides what's notable based on the conversation; we keep
 * extraction strict on output format so parsing is reliable.
 */
const EXTRACTION_PROMPT = `You read a conversation and extract recall-worthy facts the assistant should remember about this user/project in future conversations.

Look for: people mentioned (with relationships, names, ages), places, projects, products, preferences, ongoing situations, and other specific entities or facts that are stated or strongly implied.

OUTPUT FORMAT — strict:
- One FACT per line.
- Each line: FACT: <short name> | <one-line description>
- No preamble, no explanation, no bullets, no headings.
- If nothing notable appears, output a single line: NONE

Only output information stated or strongly implied in the conversation. Do not invent. Skip generic terms ("the user", "the team") with no specific identity.

Examples:
FACT: Todor | user's son, 2.5 years old
FACT: Tom Reyes | backend engineer worried about Q4 timeline
FACT: Acme Cloud | the customer's primary product, runs on Postgres
FACT: Postgres migration | scoped for Q1, blocked on schema review

CONVERSATION:
`;

const FACT_LINE_RE = /^FACT:\s*(.+?)\s*\|\s*(.+)$/i;

const formatHistory = (messages: ConvMessage[]): string =>
  messages
    .filter((m) => m.role !== 'system' && m.content.trim().length > 0)
    .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content.trim()}`)
    .join('\n\n');

export const parseExtractedFacts = (raw: string): ProposedFact[] => {
  const out: ProposedFact[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^NONE\b/i.test(trimmed)) continue;
    const m = FACT_LINE_RE.exec(trimmed);
    if (!m) continue;
    const name = m[1]!.trim();
    const description = m[2]!.trim();
    if (!name || !description) continue;
    out.push({ name, description });
  }
  return out;
};

const dedupe = (
  proposed: ProposedFact[],
  existing: Array<{ name: string }>
): ProposedFact[] => {
  const existingLower = new Set(existing.map((e) => e.name.toLowerCase()));
  const seenLower = new Set<string>();
  const out: ProposedFact[] = [];
  for (const p of proposed) {
    const key = p.name.toLowerCase();
    if (existingLower.has(key) || seenLower.has(key)) continue;
    seenLower.add(key);
    out.push(p);
  }
  return out;
};

/**
 * Run extraction and return proposals deduped against existing project
 * facts — does NOT save anything. The caller decides which proposals to
 * keep and persists them via `FactStore.create` (or `Rag.saveFact`).
 *
 * The LLM must be loaded; we don't load it here because warmup is the
 * host's responsibility.
 */
export const proposeFactsFromConversation = async (
  deps: { llm: LlmAdapter; facts: FactStore },
  messages: ConvMessage[],
  projectId: string,
  opts: { signal?: AbortSignal; maxTokens?: number } = {}
): Promise<ProposedFact[]> => {
  if (!deps.llm.isReady()) throw new Error('llm not loaded');
  const prompt = `${EXTRACTION_PROMPT}${formatHistory(messages)}\n\nFACTS:\n`;

  let buffer = '';
  await deps.llm.streamCompletion(
    prompt,
    {
      temperature: 0.2,
      maxTokens: opts.maxTokens ?? 512,
      ...(opts.signal ? { signal: opts.signal } : {})
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

  const proposed = parseExtractedFacts(buffer);
  const existing = await deps.facts.list(projectId);
  return dedupe(proposed, existing);
};

/**
 * Extract facts from a conversation and persist any new ones in one shot.
 * Convenience wrapper for callers that don't need a confirm step.
 */
export const extractFactsFromConversation = async (
  deps: { llm: LlmAdapter; facts: FactStore },
  messages: ConvMessage[],
  projectId: string,
  opts: { signal?: AbortSignal; maxTokens?: number } = {}
): Promise<Fact[]> => {
  const fresh = await proposeFactsFromConversation(deps, messages, projectId, opts);
  const saved: Fact[] = [];
  for (const f of fresh) {
    const fact = await deps.facts.create({
      projectId,
      name: f.name,
      description: f.description
    });
    saved.push(fact);
  }
  return saved;
};
