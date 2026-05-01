import type { Message } from '@/db/messages';
import type { Tool } from '@/tools/types';
import { renderToolsBlock } from '@/tools/systemPrompt';
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
  /** Tools the model is allowed to invoke. Pass [] to suppress the TOOLS block. */
  tools?: Tool[];
  /** Conversation-specific system prompt (set by skill or by user override). */
  conversationSystemPrompt: string;
  history: Message[];
  newUserTurn: string;
  contextWindow: number;
  reservedForResponse: number;
};

export type BuildPromptResult = {
  text: string;
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
  const toolsBlock = a.tools && a.tools.length > 0 ? renderToolsBlock(a.tools) : '';
  if (toolsBlock) parts.push(toolsBlock);
  if (a.conversationSystemPrompt.trim()) parts.push(a.conversationSystemPrompt.trim());
  return parts.join('\n\n');
};

const formatTurn = (role: 'user' | 'assistant', content: string): string =>
  role === 'user' ? `<|user|>\n${content}` : `<|assistant|>\n${content}`;

export const buildPrompt = (args: BuildPromptArgs): BuildPromptResult => {
  const budget = args.contextWindow - args.reservedForResponse - SAFETY;
  if (budget <= 0) throw new Error('context window too small for reserved response');

  // Try to fit the full system block with retrieval. If retrieval pushes
  // us over budget, drop retrieval and try again — better to lose context
  // augmentation than to fail the send.
  let effectiveArgs = args;
  let sys = composeSystem(effectiveArgs);
  let sysBlock = sys ? `<|system|>\n${sys}\n\n` : '';
  const newTurn = `${formatTurn('user', args.newUserTurn)}\n<|assistant|>\n`;
  const newTurnTokens = approxTokens(newTurn);

  if (
    approxTokens(sysBlock) + newTurnTokens > budget &&
    args.relevantSnippets &&
    args.relevantSnippets.length > 0
  ) {
    const noSnippets: BuildPromptArgs = { ...args };
    delete (noSnippets as Partial<BuildPromptArgs>).relevantSnippets;
    effectiveArgs = noSnippets;
    sys = composeSystem(effectiveArgs);
    sysBlock = sys ? `<|system|>\n${sys}\n\n` : '';
  }

  const sysTokens = approxTokens(sysBlock);
  const fixedTokens = sysTokens + newTurnTokens;

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
    const text =
      (pair.user ? `${formatTurn('user', pair.user.content)}\n` : '') +
      (pair.assistant ? `${formatTurn('assistant', pair.assistant.content)}\n` : '');
    const tk = approxTokens(text);
    if (used + tk > budget) break;
    used += tk;
    includedPairs.push(pair);
  }

  const droppedMessages = pairs
    .slice(includedPairs.length)
    .reduce((sum, p) => sum + (p.user ? 1 : 0) + (p.assistant ? 1 : 0), 0);

  // Render included pairs oldest→newest.
  const historyText = includedPairs
    .slice()
    .reverse()
    .map(
      (p) =>
        (p.user ? `${formatTurn('user', p.user.content)}\n` : '') +
        (p.assistant ? `${formatTurn('assistant', p.assistant.content)}\n` : '')
    )
    .join('');

  const text = sysBlock + historyText + newTurn;
  return {
    text,
    dropped: droppedMessages,
    systemTokensApprox: sysTokens,
    historyTokensApprox: used - fixedTokens
  };
};
