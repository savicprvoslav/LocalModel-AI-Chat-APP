import type { Tool } from './types';
import { searchMessages } from '@/db/search';

/**
 * Local FTS over the user's own past messages. Reuses the same index
 * the search screen uses. No network involved — purely a memory aid.
 */
export const searchConversationsTool: Tool = {
  id: 'search_conversations',
  name: 'Search past conversations',
  description:
    'Search the user\'s own prior chats for a phrase. Returns up to 5 matching snippets with their conversation titles. Use when the user references something they said earlier.',
  params: [
    {
      name: 'query',
      type: 'string',
      required: true,
      description: 'Words to search for, like "postgres migration".'
    }
  ],
  network: false,
  run: async (args) => {
    const query = args.query;
    if (typeof query !== 'string' || !query.trim()) {
      throw new Error('search_conversations: missing string `query`');
    }
    const results = await searchMessages(query.trim(), 5);
    if (results.length === 0) return `No matches in past conversations for "${query}".`;
    const lines: string[] = [];
    for (const r of results) {
      const title = r.conversation_title || 'untitled';
      const project = r.project_id ? `~/${r.project_id.slice(0, 6)}` : '~/inbox';
      lines.push(`- [${project}/${title}] ${r.snippet}`);
    }
    return lines.join('\n');
  }
};
