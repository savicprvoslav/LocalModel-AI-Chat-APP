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
import { updateConversation } from '@/db/conversations';

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
    stop
  } = useConversation(conversationId);
  const listRef = useRef<FlatList>(null);
  const [activeModel, setActiveModel] = useState<string>('');
  const [ctx, setCtx] = useState<number>(4096);
  const [skill, setSkill] = useState<Skill | null>(null);

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

  const onOverflowPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Export as Markdown', 'Cancel'],
          cancelButtonIndex: 1
        },
        (idx) => {
          if (idx === 0) void exportMarkdown();
        }
      );
    } else {
      Alert.alert(conversation?.title ?? 'Conversation', undefined, [
        { text: 'Export as Markdown', onPress: () => void exportMarkdown() },
        { text: 'Cancel', style: 'cancel' }
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
        contentContainerStyle={{ padding: t.spacing.lg }}
        renderItem={({ item, index }) => (
          <MessageBubble
            message={item}
            isStreaming={
              isStreaming && index === messages.length - 1 && item.role === 'assistant'
            }
          />
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />
      <Composer
        status={statusState}
        isStreaming={isStreaming || isWarming}
        onSend={send}
        onStop={stop}
        disabled={!conversation}
        placeholder={placeholder}
        initialValue={starterText}
      />
    </KeyboardAvoidingView>
  );
};
