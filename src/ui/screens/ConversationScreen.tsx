import { useEffect, useRef, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import type { StatusLineState } from '../components/StatusLine';
import { ActionSheet, ActionSheetItem } from '../components/ActionSheet';
import { WarmingLog, WarmingStage } from '../components/WarmingLog';
import { RetrievalPeek, RetrievalSnippetView } from '../components/RetrievalPeek';
import { useConversation } from '@/chat/useConversation';
import { getSetting } from '@/db/settings';
import { Skill, getSkill, listSkills } from '@/db/skills';
import { Persona, listPersonas } from '@/db/personas';
import { updateConversation, deleteConversation } from '@/db/conversations';
import { clearMessagesForConversation } from '@/db/messages';
import { PromptModal } from '../components/PromptModal';
import { EntityProposalModal } from '../components/EntityProposalModal';
import { getRag } from '@/integration/rag';
import type { ProposedFact as ProposedEntity } from '@/rag';
import { getEngine, getEngineForModel } from '@/engine';
import { modelExists, modelPath } from '@/model/storage';
import { getCatalogEntry } from '@/model/catalog';

type Props = {
  conversationId: string;
  starterText?: string;
};

export const ConversationScreen = ({ conversationId, starterText }: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const {
    conversation,
    project,
    persona,
    messages,
    attachmentsByMessage,
    status,
    error,
    tokenCount,
    tokRate,
    send,
    stop,
    retry,
    reload,
    retrievedCount,
    retrievedSnippets,
    warmingStages
  } = useConversation(conversationId);
  const listRef = useRef<FlatList>(null);
  const [activeModel, setActiveModel] = useState<string>('');
  const [ctx, setCtx] = useState<number>(4096);
  const [skill, setSkill] = useState<Skill | null>(null);
  /** Full skill list for the inline `/` slash autocomplete in the composer. */
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
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
      if (!getEngine().isReady()) {
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
        await getEngineForModel(id).load(modelPath(id));
      }
      const proposed = await getRag().proposeFactsFromConversation(
        messages,
        project.id
      );
      setProposals(proposed);
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
    const rag = getRag();
    for (const p of selected) {
      await rag.saveFact({
        projectId: project.id,
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

  const [overflowOpen, setOverflowOpen] = useState(false);
  const [personaSheetOpen, setPersonaSheetOpen] = useState(false);
  const [personasList, setPersonasList] = useState<Persona[]>([]);

  const onOverflowPress = () => {
    if (!conversation) return;
    setOverflowOpen(true);
  };

  const overflowActions: ActionSheetItem[] = conversation
    ? [
        { label: 'Rename', glyph: '✎', onPress: promptRename },
        {
          label: 'Edit system prompt',
          glyph: '$',
          onPress: promptEditSystemPrompt
        },
        ...(project
          ? [
              {
                label: 'Extract entities to project',
                glyph: '◇',
                onPress: () => void runExtractEntities()
              }
            ]
          : []),
        { label: 'Export as Markdown', glyph: '↗', onPress: () => void exportMarkdown() },
        {
          label: 'Clear history',
          kind: 'destructive' as const,
          onPress: confirmClearHistory
        },
        {
          label: 'Delete conversation',
          kind: 'destructive' as const,
          onPress: confirmDeleteConversation
        }
      ]
    : [];

  const onPersonaPillPress = async () => {
    const list = await listPersonas();
    if (list.length === 0) return;
    setPersonasList(list);
    setPersonaSheetOpen(true);
  };

  const personaActions: ActionSheetItem[] = (() => {
    const apply = async (p: Persona) => {
      await updateConversation(conversationId, { persona_id: p.id });
      router.replace(`/conversation/${conversationId}`);
    };
    const items: ActionSheetItem[] = personasList.map((p) => ({
      label: p.name,
      glyph: p.id === persona?.id ? '●' : '◎',
      kind: p.id === persona?.id ? ('warm' as const) : undefined,
      onPress: () => void apply(p)
    }));
    if (persona) {
      items.push({
        label: 'Edit current persona',
        glyph: '✎',
        onPress: () => router.push(`/persona/${persona.id}`)
      });
    }
    return items;
  })();

  useEffect(() => {
    void (async () => {
      setActiveModel((await getSetting('active_model_id')) ?? '');
      setCtx(await getSetting('context_window'));
      setAvailableSkills(await listSkills());
    })();
  }, []);

  // Apply a skill to this conversation when invoked via the composer's
  // slash menu. Mirrors what tapping a skill chip on the home screen
  // would have done — but for an existing conversation, mid-stream.
  // Persists for the rest of the conversation's life.
  const applySkillToConversation = async (s: Skill): Promise<void> => {
    if (!conversation) return;
    await updateConversation(conversation.id, {
      skill_id: s.id,
      // Adopt the skill's default persona too — that's the whole point of
      // the skill, and the persona pill in the banner reflects it.
      ...(s.default_persona_id ? { persona_id: s.default_persona_id } : {}),
      // The skill's system_prompt becomes this conversation's
      // system_prompt. (For thin-wrapper skills like Caveman, this is
      // empty and the persona carries the voice.)
      system_prompt: s.system_prompt
    });
    await reload();
  };

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
      {/* V2 header — back · breadcrumb + serif title · overflow */}
      <View
        style={{
          paddingTop: insets.top + t.spacing.md - 2,
          paddingHorizontal: t.spacing.lg,
          paddingBottom: t.spacing.md - 2,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border.subtle,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm + 2
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 32,
            height: 32,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            borderRadius: t.radii.sm,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ fontFamily: t.fonts.mono, fontSize: 14, color: t.colors.text.primary }}>
            ←
          </Text>
        </Pressable>
        <Pressable
          onPress={conversation ? promptRename : undefined}
          style={{ flex: 1, minWidth: 0 }}
        >
          {project ? (
            <Pressable onPress={() => router.push(`/project/${project.id}`)}>
              <Text style={{ ...t.type.meta, color: t.colors.accent.warm }}>
                {`~/${project.name}`}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>~/inbox</Text>
          )}
          <Text
            style={{ ...t.type.displaySerif, color: t.colors.text.primary }}
            numberOfLines={1}
          >
            {conversation?.title ?? '…'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onOverflowPress}
          hitSlop={8}
          style={{
            width: 32,
            height: 32,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            borderRadius: t.radii.sm,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text
            style={{
              fontFamily: t.fonts.mono,
              fontSize: 16,
              letterSpacing: 1,
              color: t.colors.text.tertiary
            }}
          >
            ···
          </Text>
        </Pressable>
      </View>

      {/* Persona / skill banner — one pill, no model label.
          - If a skill is active and its default persona matches the current
            persona, show only the skill pill (they're the same identity).
          - If only persona, show that.
          - Model name lives on the composer status line below; no need to
            duplicate it here. */}
      {(() => {
        if (!persona && !skill) return null;
        const skillSubsumes = skill && persona && skill.default_persona_id === persona.id;
        const showSkillOnly = !!skill;
        const showPersonaOnly = !skill && !!persona;
        return (
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: t.spacing.lg,
              paddingVertical: t.spacing.sm,
              gap: t.spacing.sm,
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: t.colors.border.subtle,
              backgroundColor: t.colors.bg.subtle
            }}
          >
            {showSkillOnly && skill ? (
              <Pressable
                onPress={() => router.push(`/skill/${skill.id}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderWidth: 1,
                  borderColor: t.colors.accent.warm,
                  borderRadius: t.radii.sm
                }}
              >
                <Text
                  style={{
                    fontFamily: t.fonts.mono,
                    fontSize: 9.5,
                    fontWeight: '600',
                    letterSpacing: 0.6,
                    color: t.colors.accent.warm
                  }}
                >
                  {`/${skill.name.toLowerCase()}`}
                </Text>
              </Pressable>
            ) : null}
            {/* If the skill carries a different persona than active, surface
                that explicitly so the user isn't surprised. Suppressed when
                the skill subsumes the persona (the common case). */}
            {showSkillOnly && persona && !skillSubsumes ? (
              <Pressable
                onPress={onPersonaPillPress}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderWidth: 1,
                  borderColor: t.colors.border.subtle,
                  borderRadius: t.radii.sm
                }}
              >
                <Text
                  style={{
                    fontFamily: t.fonts.mono,
                    fontSize: 9.5,
                    fontWeight: '600',
                    letterSpacing: 0.6,
                    color: t.colors.text.secondary
                  }}
                >
                  {`◎ ${persona.name.toUpperCase()}`}
                </Text>
              </Pressable>
            ) : null}
            {showPersonaOnly && persona ? (
              <Pressable
                onPress={onPersonaPillPress}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderWidth: 1,
                  borderColor: t.colors.border.subtle,
                  borderRadius: t.radii.sm
                }}
              >
                <Text
                  style={{
                    fontFamily: t.fonts.mono,
                    fontSize: 9.5,
                    fontWeight: '600',
                    letterSpacing: 0.6,
                    color: t.colors.text.secondary
                  }}
                >
                  {`◎ ${persona.name.toUpperCase()}`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })()}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.lg,
          paddingBottom: t.spacing.lg,
          flexGrow: 1
        }}
        renderItem={({ item, index }) => (
          <MessageBubble
            message={item}
            index={index + 1}
            attachments={attachmentsByMessage[item.id]}
            isStreaming={
              isStreaming && index === messages.length - 1 && item.role === 'assistant'
            }
          />
        )}
        ListEmptyComponent={
          // Empty state — single block: skill OR persona description in
          // serif, no chrome. The fence-box decoration and ASCII banner
          // were redundant when the skill identity was already in the
          // banner pill above.
          <View style={{ paddingTop: t.spacing.xl, gap: t.spacing.sm + 2 }}>
            {skill ? (
              <Text
                style={{
                  ...t.type.bodyAi,
                  color: t.colors.text.secondary,
                  fontSize: 15,
                  lineHeight: 22
                }}
              >
                {skill.description}
              </Text>
            ) : persona ? (
              <Text
                style={{
                  ...t.type.bodyAi,
                  color: t.colors.text.secondary,
                  fontSize: 15,
                  lineHeight: 22
                }}
              >
                {persona.description}
              </Text>
            ) : null}
            <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
              {skill?.starter_text
                ? 'starter text waits below · enter sends'
                : 'enter sends · shift+enter newline'}
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: t.spacing.lg }}>
            {warmingStages.length > 0 ? <WarmingLog stages={warmingStages} /> : null}
            {retrievedSnippets.length > 0 && isWarming ? (
              <RetrievalPeek
                snippets={retrievedSnippets.map((s) => ({
                  score: s.score,
                  source: s.source,
                  excerpt: s.excerpt
                }))}
              />
            ) : null}
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
        skills={availableSkills}
        onApplySkill={(s) => void applySkillToConversation(s)}
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
      <ActionSheet
        visible={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        title={conversation ? `~/${(project?.name ?? 'inbox').toLowerCase()}` : ''}
        subtitle={conversation?.title}
        actions={overflowActions}
      />
      <ActionSheet
        visible={personaSheetOpen}
        onClose={() => setPersonaSheetOpen(false)}
        title="~/personas"
        subtitle="switch the active voice"
        actions={personaActions}
      />
    </KeyboardAvoidingView>
  );
};
