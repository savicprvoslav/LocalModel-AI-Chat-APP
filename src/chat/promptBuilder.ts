import type { Message } from '@/db/messages';
import type { ChatMessage } from '@/engine/types';
import { BASE_SYSTEM_PROMPT } from './baseSystemPrompt';

export type ProjectEntityRef = { name: string; description: string };

export type RetrievedSnippet = {
  /** Short label like `~/acme/board-prep` shown in the prompt. */
  source: string;
  excerpt: string;
};

export type BuildPromptArgs = {
  /**
   * Base layer that runs underneath every persona/skill. Set to '' to
   * suppress (e.g. for tests or for personas that need a totally clean
   * slate). Defaults to BASE_SYSTEM_PROMPT when omitted.
   */
  baseSystemPrompt?: string;
  /**
   * The active persona's system prompt. Defines who the assistant is.
   * Falls back to '' if no persona is set.
   */
  personaSystemPrompt: string;
  projectNotes: string;
  /** Structured list of `name → description` entries scoped to the project. */
  projectEntities: ProjectEntityRef[];
  /** Snippets retrieved from past conversations relevant to the new user turn. */
  relevantSnippets?: RetrievedSnippet[];
  /** Conversation-specific system prompt (set by skill or by user override). */
  conversationSystemPrompt: string;
  history: Message[];
  newUserTurn: string;
  contextWindow: number;
  reservedForResponse: number;
};

export type BuildMessagesResult = {
  messages: ChatMessage[];
  dropped: number;
  systemTokensApprox: number;
  historyTokensApprox: number;
};

const SAFETY = 256;
const approxTokens = (s: string): number => Math.ceil(s.length / 4);

const composeProjectBlock = (
  notes: string,
  entities: ProjectEntityRef[]
): string => {
  const parts: string[] = [];
  if (notes.trim()) parts.push(notes.trim());
  if (entities.length > 0) {
    const lines = entities
      .filter((e) => e.name.trim())
      .map((e) =>
        e.description.trim() ? `- ${e.name}: ${e.description.trim()}` : `- ${e.name}`
      );
    if (lines.length > 0) parts.push(`Known entities in this project:\n${lines.join('\n')}`);
  }
  if (parts.length === 0) return '';
  return `PROJECT CONTEXT:\n${parts.join('\n\n')}`;
};

const composeRetrievalBlock = (snippets: RetrievedSnippet[] | undefined): string => {
  if (!snippets || snippets.length === 0) return '';
  const lines = snippets
    .filter((s) => s.excerpt.trim())
    .map((s) => `- [${s.source.trim()}] ${s.excerpt.trim()}`);
  if (lines.length === 0) return '';
  return [
    'RELEVANT FROM PAST CONVERSATIONS (background only — only mention if directly useful):',
    ...lines
  ].join('\n');
};

const composeSystem = (a: BuildPromptArgs): string => {
  const parts: string[] = [];
  const base = a.baseSystemPrompt ?? BASE_SYSTEM_PROMPT;
  if (base.trim()) parts.push(base.trim());
  if (a.personaSystemPrompt.trim()) parts.push(a.personaSystemPrompt.trim());
  const projectBlock = composeProjectBlock(a.projectNotes, a.projectEntities);
  if (projectBlock) parts.push(projectBlock);
  const retrievalBlock = composeRetrievalBlock(a.relevantSnippets);
  if (retrievalBlock) parts.push(retrievalBlock);
  // NOTE: tools are no longer described in the system prompt. They flow
  // through llama.rn's native tool-calling API (`completion({tools, jinja})`),
  // which uses each model's own template. Hand-rolled tool descriptions in
  // the system prompt fight what the model was trained on and produced
  // hallucinated tool calls — see the project history for details.
  if (a.conversationSystemPrompt.trim()) parts.push(a.conversationSystemPrompt.trim());
  return parts.join('\n\n');
};

/**
 * Build a structured `messages` array consumed by `engine.streamCompletion`.
 *
 * The engine passes these straight to llama.rn with `jinja: true`, so each
 * model formats them with its own native chat template — Qwen ChatML, Phi-4,
 * Gemma, Llama 3.x are all handled automatically.
 *
 * Context-budget logic: drops oldest pairs first, then drops retrieval
 * snippets if they push us over budget.
 */
export const buildMessages = (args: BuildPromptArgs): BuildMessagesResult => {
  const budget = args.contextWindow - args.reservedForResponse - SAFETY;
  if (budget <= 0) throw new Error('context window too small for reserved response');

  let effectiveArgs = args;
  let sys = composeSystem(effectiveArgs);
  const userTurn = args.newUserTurn;
  const userTokens = approxTokens(userTurn);

  if (
    approxTokens(sys) + userTokens > budget &&
    args.relevantSnippets &&
    args.relevantSnippets.length > 0
  ) {
    const noSnippets: BuildPromptArgs = { ...args };
    delete (noSnippets as Partial<BuildPromptArgs>).relevantSnippets;
    effectiveArgs = noSnippets;
    sys = composeSystem(effectiveArgs);
  }

  const sysTokens = approxTokens(sys);
  const fixedTokens = sysTokens + userTokens;

  if (fixedTokens > budget) {
    throw new Error('Message too long for current context window');
  }

  // Walk history newest→oldest, including pairs (user+assistant).
  type Pair = { user?: Message; assistant?: Message };
  const pairs: Pair[] = [];
  for (let i = args.history.length - 1; i >= 0; i--) {
    const m = args.history[i];
    if (!m) continue;
    if (m.role === 'assistant') {
      const prev = i > 0 ? args.history[i - 1] : undefined;
      if (prev && prev.role === 'user') {
        pairs.push({ user: prev, assistant: m });
        i -= 1;
      } else {
        pairs.push({ assistant: m });
      }
    } else if (m.role === 'user') {
      pairs.push({ user: m });
    }
  }

  let used = fixedTokens;
  const includedPairs: Pair[] = [];
  for (const pair of pairs) {
    const tk =
      (pair.user ? approxTokens(pair.user.content) : 0) +
      (pair.assistant ? approxTokens(pair.assistant.content) : 0);
    if (used + tk > budget) break;
    used += tk;
    includedPairs.push(pair);
  }

  const droppedMessages = pairs
    .slice(includedPairs.length)
    .reduce((sum, p) => sum + (p.user ? 1 : 0) + (p.assistant ? 1 : 0), 0);

  // Render included pairs oldest→newest. After each persisted assistant
  // turn, expand any recorded tool invocations into `role:'tool'` messages
  // so follow-up turns can reference the raw tool data — e.g. "what was
  // the humidity?" still has the weather payload in context even if the
  // assistant's synthesized answer didn't mention it.
  const messages: ChatMessage[] = [];
  if (sys) messages.push({ role: 'system', content: sys });
  for (const pair of includedPairs.slice().reverse()) {
    if (pair.user) messages.push({ role: 'user', content: pair.user.content });
    if (pair.assistant) {
      messages.push({ role: 'assistant', content: pair.assistant.content });
      const calls = pair.assistant.tool_calls;
      if (calls && calls.length > 0) {
        for (const call of calls) {
          messages.push({
            role: 'tool',
            name: call.name,
            content: call.error ? `ERROR: ${call.error}` : call.result
          });
        }
      }
    }
  }
  messages.push({ role: 'user', content: userTurn });

  return {
    messages,
    dropped: droppedMessages,
    systemTokensApprox: sysTokens,
    historyTokensApprox: used - fixedTokens
  };
};
