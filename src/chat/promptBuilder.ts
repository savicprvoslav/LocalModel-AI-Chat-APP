import type { Message } from '@/db/messages';

export type BuildPromptArgs = {
  defaultSystemPrompt: string;
  projectNotes: string;
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

const composeSystem = (a: BuildPromptArgs): string => {
  const parts: string[] = [];
  if (a.defaultSystemPrompt.trim()) parts.push(a.defaultSystemPrompt.trim());
  if (a.projectNotes.trim()) parts.push(`PROJECT CONTEXT:\n${a.projectNotes.trim()}`);
  if (a.conversationSystemPrompt.trim()) parts.push(a.conversationSystemPrompt.trim());
  return parts.join('\n\n');
};

const formatTurn = (role: 'user' | 'assistant', content: string): string =>
  role === 'user' ? `<|user|>\n${content}` : `<|assistant|>\n${content}`;

export const buildPrompt = (args: BuildPromptArgs): BuildPromptResult => {
  const budget = args.contextWindow - args.reservedForResponse - SAFETY;
  if (budget <= 0) throw new Error('context window too small for reserved response');

  const sys = composeSystem(args);
  const sysBlock = sys ? `<|system|>\n${sys}\n\n` : '';
  const newTurn = `${formatTurn('user', args.newUserTurn)}\n<|assistant|>\n`;

  const sysTokens = approxTokens(sysBlock);
  const newTurnTokens = approxTokens(newTurn);
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
