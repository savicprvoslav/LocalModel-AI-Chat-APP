import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
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
          project ? (
            <ProjectPill name={project.name} onPress={() => router.push(`/project/${project.id}`)} />
          ) : undefined
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
              onPress={() => router.push(`/persona/${persona.id}`)}
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
