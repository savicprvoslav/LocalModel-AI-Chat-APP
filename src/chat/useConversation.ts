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
import { getEngine, getEngineForModel } from '@/engine';
import { buildPrompt } from './promptBuilder';
import { getCatalogEntry } from '@/model/catalog';
import { modelPath } from '@/model/storage';
import { Persona, getPersona, getDefaultPersona } from '@/db/personas';
import { getSkill } from '@/db/skills';
import { getRag } from '@/integration/rag';
import type { Snippet } from '@/rag';
import {
  enabledTools,
  findTool,
  formatToolResult,
  parseToolCalls,
  runToolCall
} from '@/tools';
import type { FinishReason } from '@/engine/types';

export type ConversationStatus = 'idle' | 'warming' | 'streaming' | 'error' | 'cancelled';

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
      const rag = getRag();
      const entities = project ? await rag.listFacts(project.id) : [];
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
      void rag.indexMessage({ messageId: userMsg.id, content: text });
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
      let snippets: Snippet[] = [];
      if (settings.retrieval_enabled) {
        try {
          snippets = await rag.retrieve(text, {
            excludeConversationId: conv.id,
            projectScope: project ? project.id : null,
            limit: settings.retrieval_k
          });
          if (snippets.length > 0) {
            const snippetsView: RetrievalSnippetMeta[] = snippets.map((sn) => {
              const projectSlug = sn.projectId ? '~/proj' : '~/inbox';
              return {
                score: sn.score,
                source: `${projectSlug}/${sn.conversationTitle
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

      const activeTools = enabledTools({
        tools_enabled: settings.tools_enabled,
        per_tool: settings.tools_per_tool
      });

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
            const projectSlug = s.projectId
              ? '~/' // we don't have project name here cheaply; the conversation title is enough
              : '~/inbox/';
            return {
              source: `${projectSlug}${s.conversationTitle.toLowerCase().replace(/\s+/g, '-').slice(0, 28)}`,
              excerpt: s.excerpt
            };
          }),
          tools: activeTools,
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

      const engine = getEngineForModel(desiredModelId);
      // If the engine is loaded with a different model than the skill wants,
      // dispose the current one and load the desired one.
      if (!engine.isReady() || (skill?.model_id && skill.model_id !== settings.active_model_id)) {
        if (engine.isReady()) await engine.dispose();

        // Synthetic warming stages — published one-by-one so the UI can
        // animate them. The actual `engine.load()` is one opaque call; we
        // tick `mmap` shortly after start (file open is fast), then attribute
        // the rest of the wall-clock load to `kv` (the bulk of cold-load time
        // is kv-cache + warmup inside llama.rn). `kern` and `sys` are
        // post-load polish ticks.
        //
        // The WarmingLog component animates a spinner on the active stage and
        // shows live elapsed seconds — without that, the user would see a
        // static `◐` for ~30 s on large models and assume the app froze.
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
        let mmapTickedAt: number | null = null;
        // Tick mmap a hair after starting so the user sees movement.
        const mmapTimer = setTimeout(() => {
          mmapTickedAt = Date.now();
          tickStage(0, mmapTickedAt - loadStarted);
        }, 300);
        try {
          await engine.load(modelPath(desiredModelId));
          clearTimeout(mmapTimer);
          const loadDoneAt = Date.now();
          // If load finished before the mmap timer fired (very fast load),
          // tick mmap now with actual elapsed.
          if (mmapTickedAt === null) {
            mmapTickedAt = loadDoneAt;
            tickStage(0, loadDoneAt - loadStarted);
          }
          // kv gets the bulk of the wait — this is the long stage on cold loads.
          tickStage(1, loadDoneAt - mmapTickedAt);
          // Post-load synthetic ticks for visual polish.
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

      const runStreamRound = (
        roundPrompt: string
      ): Promise<
        | { ok: true; tokenCount: number; finishReason: FinishReason }
        | { ok: false; error: Error }
      > =>
        new Promise((resolve) => {
          let settled = false;
          void engine.streamCompletion(
            roundPrompt,
            {
              temperature: effectiveTemp,
              maxTokens: settings.max_tokens,
              signal: abortRef.current!.signal
            },
            {
              onToken: (t) => {
                buffer += t;
                count++;
                if (Date.now() - lastFlush >= 33) void flush();
              },
              onDone: ({ tokenCount, finishReason }) => {
                if (settled) return;
                settled = true;
                resolve({ ok: true, tokenCount, finishReason });
              },
              onError: (err) => {
                if (settled) return;
                settled = true;
                resolve({ ok: false, error: err });
              }
            }
          );
        });

      let currentPrompt = prompt;
      let lastBufferLen = 0;
      let iterations = 0;
      let finalFinish: FinishReason = 'stop';
      let lastError: Error | null = null;

      // Iteration loop: stream → parse for tool calls → run them → continue.
      // When tools are disabled (or the model emits none), this runs exactly
      // once and is identical to the pre-tools flow.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const round = await runStreamRound(currentPrompt);
        if (!round.ok) {
          lastError = round.error;
          break;
        }
        finalFinish = round.finishReason;

        const newPortion = buffer.slice(lastBufferLen);
        const calls = activeTools.length > 0 ? parseToolCalls(newPortion) : [];

        if (calls.length === 0) break;
        if (iterations >= settings.tools_max_iterations) {
          // Burn-out: tell the model further tool calls won't be honored
          // (it'll have to answer with what it already has).
          buffer += `\n<tool_result>\nERROR: tool-call iteration limit (${settings.tools_max_iterations}) reached. Answer with the information you already have.\n</tool_result>\n`;
          await flush();
          break;
        }

        for (const call of calls) {
          const tool = findTool(call.name);
          if (!tool || !activeTools.find((t) => t.id === tool.id)) {
            const reason = tool
              ? `tool "${call.name}" is disabled`
              : `unknown tool "${call.name}"`;
            buffer = buffer.replace(call.raw, formatToolResult(call.raw, '', reason));
            continue;
          }
          const inv = await runToolCall(tool, call, {
            ...(abortRef.current?.signal ? { signal: abortRef.current.signal } : {})
          });
          buffer = buffer.replace(call.raw, formatToolResult(call.raw, inv.result, inv.error));
        }

        await flush();
        // Continuation: feed the model the original prompt plus everything
        // the assistant has produced so far (now containing tool results).
        currentPrompt = prompt + buffer;
        lastBufferLen = buffer.length;
        iterations++;
      }

      if (lastError) {
        await updateMessageStream(asstMsg.id, buffer);
        if (lastError.name === 'AbortError') {
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
            error: lastError!.message,
            messages: s.messages.map((m) =>
              m.id === asstMsg.id
                ? { ...m, content: buffer, finish_reason: 'error' }
                : m
            )
          }));
        }
        return;
      }

      // Clear the transient pre-stream peek now that we have output.
      setState((s) => ({ ...s, retrievedSnippets: [] }));
      await updateMessageStream(asstMsg.id, buffer);
      await finishMessage(asstMsg.id, {
        finish_reason: finalFinish,
        token_count: count,
        model_id: desiredModelId
      });
      await touchConversation(conv.id);
      // Embed the assistant turn so future retrieval can surface it.
      void rag.indexMessage({ messageId: asstMsg.id, content: buffer });
      setState((s) => ({
        ...s,
        status: 'idle',
        tokenCount: count,
        messages: s.messages.map((m) =>
          m.id === asstMsg.id
            ? { ...m, content: buffer, token_count: count, finish_reason: finalFinish }
            : m
        )
      }));
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
