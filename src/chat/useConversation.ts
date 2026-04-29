import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Message,
  appendMessage,
  finishMessage,
  listMessages,
  updateMessageStream
} from '@/db/messages';
import {
  Conversation,
  getConversation,
  touchConversation,
  updateConversation
} from '@/db/conversations';
import { Project, getProject } from '@/db/projects';
import { getAllSettings, Settings } from '@/db/settings';
import { getEngine } from '@/engine';
import { buildPrompt } from './promptBuilder';
import { getCatalogEntry } from '@/model/catalog';
import { modelPath } from '@/model/storage';
import { Persona, getPersona, getDefaultPersona } from '@/db/personas';
import { listEntities } from '@/db/projectEntities';
import { getSkill } from '@/db/skills';
import { upsertEmbedding } from '@/db/embeddings';
import { retrieveRelevant, RelevantSnippet } from './retrieve';

export type ConversationStatus = 'idle' | 'warming' | 'streaming' | 'error' | 'cancelled';

/**
 * Embed and persist a message vector. Failures are swallowed — embeddings
 * are an enhancement, not a hard requirement; the message itself is already
 * persisted by the caller.
 */
const embedAndStore = async (
  messageId: string,
  text: string
): Promise<void> => {
  try {
    if (!text.trim()) return;
    const engine = getEngine();
    if (!engine.isReady()) return;
    const { vector, embedder } = await engine.embed(text);
    if (!vector || vector.length === 0) return;
    await upsertEmbedding({ message_id: messageId, vector, embedder });
  } catch {
    // Best-effort — see doc above.
  }
};

export type RetrievalSnippetMeta = {
  score: number;
  source: string;
  excerpt: string;
};

export type WarmingStageView = {
  key: string;
  label: string;
  state: 'pend' | 'ok';
  ms?: number;
};

export type UseConversationState = {
  conversation: Conversation | null;
  project: Project | null;
  persona: Persona | null;
  messages: Message[];
  status: ConversationStatus;
  error: string | null;
  tokenCount: number;
  tokRate: number;
  /** Number of past-conversation snippets retrieved for the current send. */
  retrievedCount: number;
  /** Detailed snippets for the retrieval-peek UI. Cleared when streaming starts. */
  retrievedSnippets: RetrievalSnippetMeta[];
  /** Live warming-log stages while the model is loading. */
  warmingStages: WarmingStageView[];
};

export const useConversation = (conversationId: string) => {
  const [state, setState] = useState<UseConversationState>({
    conversation: null,
    project: null,
    persona: null,
    messages: [],
    status: 'idle',
    error: null,
    tokenCount: 0,
    tokRate: 0,
    retrievedCount: 0,
    retrievedSnippets: [],
    warmingStages: []
  });
  const abortRef = useRef<AbortController | null>(null);
  const settingsRef = useRef<Settings | null>(null);

  const reload = useCallback(async () => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const project = conv.project_id ? await getProject(conv.project_id) : null;
    const persona = conv.persona_id
      ? await getPersona(conv.persona_id)
      : await getDefaultPersona();
    const messages = await listMessages(conversationId);
    if (!settingsRef.current) settingsRef.current = await getAllSettings();
    setState((s) => ({ ...s, conversation: conv, project, persona, messages }));
  }, [conversationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || state.status === 'streaming' || state.status === 'warming') return;
      const settings = settingsRef.current ?? (await getAllSettings());
      settingsRef.current = settings;

      const conv = state.conversation ?? (await getConversation(conversationId));
      if (!conv) {
        setState((s) => ({ ...s, status: 'error', error: 'conversation not found' }));
        return;
      }
      const project = conv.project_id ? await getProject(conv.project_id) : null;
      const persona = conv.persona_id
        ? await getPersona(conv.persona_id)
        : await getDefaultPersona();
      const entities = project ? await listEntities(project.id) : [];
      const history = await listMessages(conversationId);

      // Auto-title from first user message if conversation is still using
      // the default placeholder. Truncate at sentence/word boundary, max 60 chars.
      const isFirstTurn = history.length === 0;
      const isPlaceholderTitle =
        conv.title === 'New conversation' || !conv.title.trim();
      if (isFirstTurn && isPlaceholderTitle) {
        const compact = text.replace(/\s+/g, ' ').trim();
        let title = compact.slice(0, 60);
        if (compact.length > 60) {
          const cutAt = title.lastIndexOf(' ');
          if (cutAt > 30) title = title.slice(0, cutAt);
          title = `${title}…`;
        }
        await updateConversation(conv.id, { title });
        conv.title = title;
        setState((s) => ({
          ...s,
          conversation: s.conversation ? { ...s.conversation, title } : s.conversation
        }));
      }

      const userMsg = await appendMessage({
        conversation_id: conv.id,
        role: 'user',
        content: text
      });
      // Best-effort embed of the user turn — runs in parallel with model warmup.
      void embedAndStore(userMsg.id, text);
      // model_id is set after we've resolved the desired model below.
      const asstMsg = await appendMessage({
        conversation_id: conv.id,
        role: 'assistant',
        content: '',
        model_id: settings.active_model_id
      });
      setState((s) => ({
        ...s,
        messages: [...history, userMsg, asstMsg],
        status: 'streaming',
        tokenCount: 0,
        tokRate: 0,
        retrievedCount: 0,
        retrievedSnippets: [],
        warmingStages: [],
        error: null
      }));

      // Persona temperature override falls back to settings default if persona has none.
      const effectiveTemp = persona?.temperature ?? settings.temperature;

      // --- Retrieval (best-effort) -------------------------------------------
      // Pull relevant snippets from prior conversations. Errors are swallowed
      // — retrieval is an enhancement, not a hard requirement.
      let snippets: RelevantSnippet[] = [];
      if (settings.retrieval_enabled) {
        try {
          const retrieveOpts: Parameters<typeof retrieveRelevant>[1] = {
            excludeConversationId: conv.id,
            projectScope: project ? project.id : null,
            limit: settings.retrieval_k
          };
          snippets = await retrieveRelevant(text, retrieveOpts);
          if (snippets.length > 0) {
            const snippetsView: RetrievalSnippetMeta[] = snippets.map((sn) => {
              const projectSlug = sn.project_id ? '~/proj' : '~/inbox';
              return {
                score: sn.score,
                source: `${projectSlug}/${sn.conversation_title
                  .toLowerCase()
                  .replace(/\s+/g, '-')
                  .slice(0, 24)}`,
                excerpt: sn.excerpt
              };
            });
            setState((s) => ({
              ...s,
              retrievedCount: snippets.length,
              retrievedSnippets: snippetsView
            }));
          }
        } catch {
          // best-effort
        }
      }

      let prompt: string;
      try {
        const built = buildPrompt({
          personaSystemPrompt: persona?.system_prompt ?? '',
          projectNotes: project?.notes ?? '',
          projectEntities: entities.map((e) => ({
            name: e.name,
            description: e.description
          })),
          relevantSnippets: snippets.map((s) => {
            const projectSlug = s.project_id
              ? '~/' // we don't have project name here cheaply; the conversation title is enough
              : '~/inbox/';
            return {
              source: `${projectSlug}${s.conversation_title.toLowerCase().replace(/\s+/g, '-').slice(0, 28)}`,
              excerpt: s.excerpt
            };
          }),
          conversationSystemPrompt: conv.system_prompt,
          history,
          newUserTurn: text,
          contextWindow: settings.context_window,
          reservedForResponse: settings.max_tokens
        });
        prompt = built.text;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await finishMessage(asstMsg.id, { finish_reason: 'error' });
        setState((s) => ({ ...s, status: 'error', error: msg }));
        return;
      }

      // Resolve which model this conversation should use:
      // skill override → conversation's skill model_id → app's active_model_id
      const skill = conv.skill_id ? await getSkill(conv.skill_id) : null;
      const desiredModelId = skill?.model_id ?? settings.active_model_id;
      if (!desiredModelId) {
        setState((s) => ({ ...s, status: 'error', error: 'no active model' }));
        return;
      }
      const entry = getCatalogEntry(desiredModelId);
      if (!entry) {
        setState((s) => ({ ...s, status: 'error', error: 'unknown model id' }));
        return;
      }

      const engine = getEngine();
      // If the engine is loaded with a different model than the skill wants,
      // dispose the current one and load the desired one.
      if (!engine.isReady() || (skill?.model_id && skill.model_id !== settings.active_model_id)) {
        if (engine.isReady()) await engine.dispose();

        // Synthetic warming stages — published one-by-one so the UI can
        // animate them. The actual `engine.load()` is one opaque call;
        // we mark `mmap` and `kv` as the load runs, then `kern` and `sys`
        // after it returns. Timings reflect what cold-loading a 3 B model
        // tends to look like on a recent iPhone (~2–4 s mmap, <1 s kv,
        // ~600 ms metal kernels, instant prompt bind).
        const stages: WarmingStageView[] = [
          { key: 'mmap', label: `mmap weights · ${entry.displayName}`, state: 'pend' },
          {
            key: 'kv',
            label: `alloc kv-cache · ${settings.context_window} ctx`,
            state: 'pend'
          },
          { key: 'kern', label: 'compile metal kernels', state: 'pend' },
          {
            key: 'sys',
            label: persona ? `bind persona · ${persona.name}` : 'bind base system prompt',
            state: 'pend'
          }
        ];
        setState((s) => ({ ...s, status: 'warming', warmingStages: stages }));

        const tickStage = (idx: number, ms: number): void => {
          setState((s) => ({
            ...s,
            warmingStages: s.warmingStages.map((stage, i) =>
              i === idx ? { ...stage, state: 'ok', ms } : stage
            )
          }));
        };

        const loadStarted = Date.now();
        // Tick mmap a hair after starting so the user sees movement.
        const mmapTimer = setTimeout(() => tickStage(0, Date.now() - loadStarted), 350);
        // Tick kv as soon as load resolves (real upper bound on alloc).
        try {
          await engine.load(modelPath(desiredModelId));
          clearTimeout(mmapTimer);
          // Whatever order they completed in, surface them now.
          const totalMs = Date.now() - loadStarted;
          tickStage(0, Math.round(totalMs * 0.6));
          tickStage(1, Math.round(totalMs * 0.2));
          // The next two are post-load synthetic ticks for visual polish.
          await new Promise((r) => setTimeout(r, 220));
          tickStage(2, 220);
          await new Promise((r) => setTimeout(r, 90));
          tickStage(3, 90);
        } catch (e) {
          clearTimeout(mmapTimer);
          const msg = e instanceof Error ? e.message : String(e);
          await finishMessage(asstMsg.id, { finish_reason: 'error' });
          setState((s) => ({
            ...s,
            status: 'error',
            error: msg,
            warmingStages: []
          }));
          return;
        }
        setState((s) => ({ ...s, status: 'streaming', warmingStages: [] }));
      }

      abortRef.current = new AbortController();
      let buffer = '';
      let count = 0;
      const startedAt = Date.now();
      let lastFlush = startedAt;

      const flush = async (): Promise<void> => {
        lastFlush = Date.now();
        await updateMessageStream(asstMsg.id, buffer);
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === asstMsg.id ? { ...m, content: buffer } : m
          ),
          tokenCount: count,
          tokRate: count / Math.max(0.5, (Date.now() - startedAt) / 1000)
        }));
      };

      await engine.streamCompletion(
        prompt,
        {
          temperature: effectiveTemp,
          maxTokens: settings.max_tokens,
          signal: abortRef.current.signal
        },
        {
          onToken: (t) => {
            buffer += t;
            count++;
            if (Date.now() - lastFlush >= 33) {
              void flush();
            }
          },
          onDone: async ({ tokenCount, finishReason }) => {
            // Clear the transient pre-stream peek now that we have output.
            setState((s) => ({ ...s, retrievedSnippets: [] }));
            await updateMessageStream(asstMsg.id, buffer);
            await finishMessage(asstMsg.id, {
              finish_reason: finishReason,
              token_count: tokenCount,
              model_id: desiredModelId
            });
            await touchConversation(conv.id);
            // Embed the assistant turn so future retrieval can surface it.
            void embedAndStore(asstMsg.id, buffer);
            setState((s) => ({
              ...s,
              status: 'idle',
              tokenCount,
              messages: s.messages.map((m) =>
                m.id === asstMsg.id
                  ? { ...m, content: buffer, token_count: tokenCount, finish_reason: finishReason }
                  : m
              )
            }));
          },
          onError: async (err) => {
            await updateMessageStream(asstMsg.id, buffer);
            if (err.name === 'AbortError') {
              await finishMessage(asstMsg.id, { finish_reason: 'cancelled' });
              setState((s) => ({
                ...s,
                status: 'cancelled',
                messages: s.messages.map((m) =>
                  m.id === asstMsg.id
                    ? { ...m, content: buffer, finish_reason: 'cancelled' }
                    : m
                )
              }));
            } else {
              await finishMessage(asstMsg.id, { finish_reason: 'error' });
              setState((s) => ({
                ...s,
                status: 'error',
                error: err.message,
                messages: s.messages.map((m) =>
                  m.id === asstMsg.id
                    ? { ...m, content: buffer, finish_reason: 'error' }
                    : m
                )
              }));
            }
          }
        }
      );
    },
    [conversationId, state.conversation, state.status]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * Retry the last user message after an error/cancel.
   * Removes the failed assistant row + its triggering user row, then re-sends.
   */
  const retry = useCallback(async () => {
    if (state.status === 'streaming' || state.status === 'warming') return;
    const msgs = state.messages;
    // Find the last user message (most recent send).
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUser = msgs[lastUserIdx]!;

    // Delete trailing user + any assistant turns after it (typically one error/cancelled row).
    const { deleteMessage } = await import('@/db/messages');
    const toDelete = msgs.slice(lastUserIdx);
    for (const m of toDelete) {
      await deleteMessage(m.id);
    }
    setState((s) => ({
      ...s,
      status: 'idle',
      error: null,
      messages: s.messages.slice(0, lastUserIdx)
    }));
    await send(lastUser.content);
  }, [state.status, state.messages, send]);

  return { ...state, send, stop, retry, reload };
};
