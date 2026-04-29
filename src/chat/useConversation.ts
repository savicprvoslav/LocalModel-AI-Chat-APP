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

export type ConversationStatus = 'idle' | 'warming' | 'streaming' | 'error' | 'cancelled';

export type UseConversationState = {
  conversation: Conversation | null;
  project: Project | null;
  persona: Persona | null;
  messages: Message[];
  status: ConversationStatus;
  error: string | null;
  tokenCount: number;
  tokRate: number;
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
    tokRate: 0
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
        error: null
      }));

      // Persona temperature override falls back to settings default if persona has none.
      const effectiveTemp = persona?.temperature ?? settings.temperature;

      let prompt: string;
      try {
        const built = buildPrompt({
          personaSystemPrompt: persona?.system_prompt ?? '',
          projectNotes: project?.notes ?? '',
          projectEntities: entities.map((e) => ({
            name: e.name,
            description: e.description
          })),
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
      const currentPath = engine.isReady() ? modelPath(desiredModelId) : null;
      if (!engine.isReady() || (skill?.model_id && skill.model_id !== settings.active_model_id)) {
        // dispose if a different model is loaded
        if (engine.isReady()) await engine.dispose();
        setState((s) => ({ ...s, status: 'warming' }));
        try {
          await engine.load(modelPath(desiredModelId));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await finishMessage(asstMsg.id, { finish_reason: 'error' });
          setState((s) => ({ ...s, status: 'error', error: msg }));
          return;
        }
        setState((s) => ({ ...s, status: 'streaming' }));
      }
      // (currentPath is unused; kept above only as a visual reminder of the contract.)
      void currentPath;

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
            await updateMessageStream(asstMsg.id, buffer);
            await finishMessage(asstMsg.id, {
              finish_reason: finishReason,
              token_count: tokenCount,
              model_id: desiredModelId
            });
            await touchConversation(conv.id);
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
