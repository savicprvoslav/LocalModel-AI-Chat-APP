import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  Text,
  View
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { ProjectPill } from '../components/ProjectPill';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import type { StatusLineState } from '../components/StatusLine';
import { useConversation } from '@/chat/useConversation';
import { getSetting } from '@/db/settings';
import { Skill, getSkill } from '@/db/skills';
import { Persona, listPersonas } from '@/db/personas';
import { updateConversation, deleteConversation } from '@/db/conversations';
import { clearMessagesForConversation } from '@/db/messages';
import { PromptModal } from '../components/PromptModal';
import { EntityProposalModal } from '../components/EntityProposalModal';
import {
  ProposedEntity,
  extractEntities,
  dedupeAgainstExisting
} from '@/chat/extractEntities';
import { listEntities, createEntity } from '@/db/projectEntities';
import { getEngine } from '@/engine';
import { modelExists, modelPath } from '@/model/storage';
import { getCatalogEntry } from '@/model/catalog';

type Props = {
  conversationId: string;
  starterText?: string;
};

export const ConversationScreen = ({ conversationId, starterText }: Props) => {
  const t = useTheme();
  const {
    conversation,
    project,
    persona,
    messages,
    status,
    error,
    tokenCount,
    tokRate,
    send,
    stop,
    retry,
    reload,
    retrievedCount
  } = useConversation(conversationId);
  const listRef = useRef<FlatList>(null);
  const [activeModel, setActiveModel] = useState<string>('');
  const [ctx, setCtx] = useState<number>(4096);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editPromptOpen, setEditPromptOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposals, setProposals] = useState<ProposedEntity[]>([]);

  // Track whether user is near the bottom of the message list. We only
  // auto-scroll on new content when they are — otherwise streaming would
  // yank them up while they're scrolled to read older messages.
  const stickToBottomRef = useRef(true);
  const lastScrollHeightRef = useRef(0);

  const onListScroll = (e: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    stickToBottomRef.current = distanceFromBottom < 80;
  };

  const onListContentSizeChange = (_: number, h: number) => {
    const grew = h > lastScrollHeightRef.current;
    lastScrollHeightRef.current = h;
    if (grew && stickToBottomRef.current) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  };

  const exportMarkdown = async () => {
    if (!conversation) return;
    const lines: string[] = [];
    lines.push(`# ${conversation.title}`);
    if (project) lines.push(`Project: ${project.name}`);
    if (persona) lines.push(`Persona: ${persona.name}`);
    if (skill) lines.push(`Skill: ${skill.name}`);
    lines.push('');
    for (const m of messages) {
      const ts = new Date(m.created_at).toISOString();
      if (m.role === 'user') {
        lines.push(`## You — ${ts}`);
      } else if (m.role === 'assistant') {
        lines.push(`## Assistant — ${ts}`);
      } else {
        lines.push(`## System — ${ts}`);
      }
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }
    const md = lines.join('\n');
    try {
      await Share.share({ message: md, title: conversation.title });
    } catch {
      // user cancelled
    }
  };

  const promptRename = () => {
    if (!conversation) return;
    setRenameOpen(true);
  };

  const promptEditSystemPrompt = () => {
    if (!conversation) return;
    setEditPromptOpen(true);
  };

  const handleRenameSubmit = async (text: string) => {
    setRenameOpen(false);
    const trimmed = text.trim();
    if (!conversation || !trimmed) return;
    await updateConversation(conversation.id, { title: trimmed });
    await reload();
  };

  const handleEditPromptSubmit = async (text: string) => {
    setEditPromptOpen(false);
    if (!conversation) return;
    await updateConversation(conversation.id, { system_prompt: text.trim() });
    await reload();
  };

  const confirmClearHistory = () => {
    if (!conversation) return;
    Alert.alert(
      'Clear history?',
      'Removes all messages in this conversation. The conversation itself stays.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearMessagesForConversation(conversation.id);
            await reload();
          }
        }
      ]
    );
  };

  const runExtractEntities = async () => {
    if (!conversation || !project) {
      Alert.alert(
        'No project',
        'Move this conversation into a project first — entities are scoped to projects.'
      );
      return;
    }
    if (messages.length === 0) {
      Alert.alert('Empty conversation', 'Send a few messages first so there\'s something to extract.');
      return;
    }
    setProposals([]);
    setProposalLoading(true);
    setProposalOpen(true);
    try {
      // Make sure a model is loaded.
      const engine = getEngine();
      if (!engine.isReady()) {
        const id = await getSetting('active_model_id');
        if (!id || !(await modelExists(id))) {
          Alert.alert('No model', 'Install a model in Settings first.');
          setProposalOpen(false);
          return;
        }
        if (!getCatalogEntry(id)) {
          Alert.alert('Unknown model', 'The active model id isn\'t in the catalog.');
          setProposalOpen(false);
          return;
        }
        await engine.load(modelPath(id));
      }
      const proposed = await extractEntities(messages, { maxTokens: 512 });
      const existing = await listEntities(project.id);
      setProposals(dedupeAgainstExisting(proposed, existing));
    } catch (e) {
      Alert.alert('Extraction failed', e instanceof Error ? e.message : String(e));
      setProposalOpen(false);
    } finally {
      setProposalLoading(false);
    }
  };

  const handleProposalAccept = async (selected: ProposedEntity[]) => {
    setProposalOpen(false);
    if (!project || selected.length === 0) return;
    for (const p of selected) {
      await createEntity({
        project_id: project.id,
        name: p.name,
        description: p.description
      });
    }
  };

  const confirmDeleteConversation = () => {
    if (!conversation) return;
    Alert.alert('Delete conversation?', `"${conversation.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteConversation(conversation.id);
          router.replace('/');
        }
      }
    ]);
  };

  const onOverflowPress = () => {
    if (!conversation) return;
    const actions: Array<{ label: string; run: () => void; destructive?: boolean }> = [
      { label: 'Rename', run: promptRename },
      { label: 'Edit system prompt', run: promptEditSystemPrompt },
      ...(project
        ? [{ label: 'Extract entities to project', run: () => void runExtractEntities() }]
        : []),
      { label: 'Export as Markdown', run: () => void exportMarkdown() },
      { label: 'Clear history', run: confirmClearHistory, destructive: true },
      { label: 'Delete conversation', run: confirmDeleteConversation, destructive: true }
    ];

    if (Platform.OS === 'ios') {
      const labels = actions.map((a) => a.label);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: conversation.title,
          options: [...labels, 'Cancel'],
          cancelButtonIndex: labels.length,
          destructiveButtonIndex: actions
            .map((a, i) => (a.destructive ? i : -1))
            .filter((i) => i >= 0)
        },
        (idx) => {
          const picked = actions[idx];
          if (picked) picked.run();
        }
      );
    } else {
      Alert.alert(conversation.title, undefined, [
        ...actions.map((a) => ({
          text: a.label,
          onPress: a.run,
          ...(a.destructive ? { style: 'destructive' as const } : {})
        })),
        { text: 'Cancel', style: 'cancel' as const }
      ]);
    }
  };

  const onPersonaPillPress = async () => {
    const personas = await listPersonas();
    if (personas.length === 0) return;

    const apply = async (p: Persona) => {
      await updateConversation(conversationId, { persona_id: p.id });
      // Reload conversation state via the hook's reload
      // (useConversation rerolls persona on next focus / send; nudge it now)
      router.replace(`/conversation/${conversationId}`);
    };

    if (Platform.OS === 'ios') {
      const labels = personas.map((p) => p.name);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Switch persona',
          options: [...labels, 'Edit current', 'Cancel'],
          cancelButtonIndex: labels.length + 1
        },
        (idx) => {
          if (idx < labels.length) {
            const picked = personas[idx];
            if (picked) void apply(picked);
          } else if (idx === labels.length && persona) {
            router.push(`/persona/${persona.id}`);
          }
        }
      );
    } else {
      Alert.alert('Switch persona', undefined, [
        ...personas.map((p) => ({
          text: p.name,
          onPress: () => void apply(p)
        })),
        ...(persona
          ? [{ text: 'Edit current', onPress: () => router.push(`/persona/${persona.id}`) }]
          : []),
        { text: 'Cancel', style: 'cancel' as const }
      ]);
    }
  };

  useEffect(() => {
    void (async () => {
      setActiveModel((await getSetting('active_model_id')) ?? '');
      setCtx(await getSetting('context_window'));
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      if (conversation?.skill_id) {
        setSkill(await getSkill(conversation.skill_id));
      } else {
        setSkill(null);
      }
    })();
  }, [conversation?.skill_id]);

  const isStreaming = status === 'streaming';
  const isWarming = status === 'warming';
  const showRetrievalIndicator = (isStreaming || isWarming) && retrievedCount > 0;

  const statusState: StatusLineState = isWarming
    ? { kind: 'warming' }
    : status === 'error'
      ? { kind: 'error', reason: error ?? 'unknown' }
      : isStreaming
        ? { kind: 'streaming', tokenCount, tokRate }
        : {
            kind: 'empty',
            ...(project?.name ? { project: project.name } : {}),
            ...(conversation?.title ? { conv: conversation.title } : {}),
            modelId: activeModel || 'no-model',
            ctx
          };

  const placeholder = skill?.placeholder_text || 'message';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title={conversation?.title ?? '…'}
        onTitlePress={conversation ? promptRename : undefined}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            {project ? (
              <ProjectPill
                name={project.name}
                onPress={() => router.push(`/project/${project.id}`)}
              />
            ) : null}
            <Pressable onPress={onOverflowPress} hitSlop={8}>
              <Text style={{ ...t.type.heading, color: t.colors.text.tertiary }}>⋯</Text>
            </Pressable>
          </View>
        }
      />
      {(persona || skill) ? (
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.xs,
            gap: t.spacing.sm,
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: t.colors.border.subtle
          }}
        >
          {persona ? (
            <Pressable
              onPress={onPersonaPillPress}
              style={{
                paddingHorizontal: t.spacing.sm,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: t.colors.border.subtle,
                borderRadius: t.radii.sm
              }}
            >
              <Text style={{ ...t.type.label, color: t.colors.text.secondary, fontSize: 9.5 }}>
                ◎ {persona.name.toUpperCase()}
              </Text>
            </Pressable>
          ) : null}
          {skill ? (
            <Pressable
              onPress={() => router.push(`/skill/${skill.id}`)}
              style={{
                paddingHorizontal: t.spacing.sm,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: t.colors.accent.warm,
                borderRadius: t.radii.sm
              }}
            >
              <Text style={{ ...t.type.label, color: t.colors.accent.warm, fontSize: 9.5 }}>
                {skill.emoji} {skill.name.toUpperCase()}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          padding: t.spacing.lg,
          flexGrow: 1
        }}
        renderItem={({ item, index }) => (
          <MessageBubble
            message={item}
            isStreaming={
              isStreaming && index === messages.length - 1 && item.role === 'assistant'
            }
          />
        )}
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              paddingVertical: t.spacing.xxl,
              gap: t.spacing.lg
            }}
          >
            {skill ? (
              <View style={{ gap: t.spacing.xs }}>
                <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>
                  {skill.emoji} {skill.name.toUpperCase()}
                </Text>
                {skill.description ? (
                  <Text
                    style={{
                      ...t.type.bodyAi,
                      color: t.colors.text.secondary,
                      fontSize: 15
                    }}
                  >
                    {skill.description}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {persona ? (
              <View style={{ gap: t.spacing.xs }}>
                <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
                  ◎ {persona.name.toUpperCase()}
                </Text>
                {persona.description ? (
                  <Text
                    style={{
                      ...t.type.bodyAi,
                      color: t.colors.text.secondary,
                      fontSize: 15
                    }}
                  >
                    {persona.description}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Text
              style={{
                ...t.type.meta,
                color: t.colors.text.quiet,
                marginTop: t.spacing.md
              }}
            >
              {skill?.starter_text
                ? '~/ready · starter text in the composer below'
                : '~/ready · type a message to start'}
            </Text>
          </View>
        }
        onContentSizeChange={onListContentSizeChange}
        onScroll={onListScroll}
        scrollEventThrottle={64}
      />
      {showRetrievalIndicator ? (
        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingVertical: 4,
            borderTopWidth: 1,
            borderTopColor: t.colors.border.subtle,
            backgroundColor: t.colors.bg.canvas
          }}
        >
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            ↺ {retrievedCount} relevant snippet{retrievedCount === 1 ? '' : 's'} from past conversations
          </Text>
        </View>
      ) : null}
      <Composer
        status={statusState}
        isStreaming={isStreaming || isWarming}
        onSend={send}
        onStop={stop}
        onRetry={status === 'error' ? () => void retry() : undefined}
        disabled={!conversation}
        placeholder={placeholder}
        initialValue={starterText}
      />
      <PromptModal
        visible={renameOpen}
        title="Rename conversation"
        initialValue={conversation?.title ?? ''}
        onSubmit={handleRenameSubmit}
        onCancel={() => setRenameOpen(false)}
      />
      <PromptModal
        visible={editPromptOpen}
        title="Conversation system prompt"
        hint="Layered on top of the active persona. Leave empty to clear."
        multiline
        initialValue={conversation?.system_prompt ?? ''}
        placeholder="Be terse. Lead with the headline."
        onSubmit={handleEditPromptSubmit}
        onCancel={() => setEditPromptOpen(false)}
      />
      <EntityProposalModal
        visible={proposalOpen}
        loading={proposalLoading}
        proposals={proposals}
        onAccept={handleProposalAccept}
        onCancel={() => setProposalOpen(false)}
      />
    </KeyboardAvoidingView>
  );
};
