import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../theme/useTheme';
import { Message } from '@/db/messages';
import { stripReasoning } from '@/chat/reasoning';
import { StreamingCursor } from './StreamingCursor';

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const metaForMessage = (m: Message, isStreaming: boolean): string => {
  const time = formatTime(m.created_at);
  if (isStreaming) return `${time} · streaming · ${m.token_count ?? 0} tok`;
  if (m.finish_reason === 'cancelled') return `${time} · stopped`;
  if (m.finish_reason === 'error') return `${time} · errored`;
  if (m.role === 'user') return time;
  return `${time} · ${m.token_count ?? 0} tok`;
};

type Props = {
  message: Message;
  isStreaming: boolean;
  /** 1-based ordinal of this message in the conversation; rendered in the gutter. */
  index: number;
};

/**
 * V2 message bubble — uses a marginalia rail with a tabular numeral index.
 * User turns get the index in mono ("01"), assistant turns get a returns
 * arrow ("↳") in warm orange. AI prose is serif at 17/27.
 */
// Compact JSON-ish summary of tool args for the chip header — keeps it on
// one line. `{"location":"Belgrade"}` becomes `location:"Belgrade"`.
const summarizeArgs = (args: Record<string, unknown>): string => {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}:${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
    .join(', ');
};

export const MessageBubble = ({ message, isStreaming, index }: Props) => {
  const t = useTheme();
  const indexStr = String(index).padStart(2, '0');
  const [showThinking, setShowThinking] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const reasoning = message.reasoning_content?.trim();
  const hasReasoning = !!reasoning && message.role === 'assistant';
  const toolCalls = message.tool_calls ?? [];
  const hasToolCalls = toolCalls.length > 0 && message.role === 'assistant';
  const toolsLabel =
    toolCalls.length === 1
      ? toolCalls[0]?.name ?? 'tool'
      : `${toolCalls.length} tools`;

  if (message.role === 'user') {
    return (
      <View
        style={{
          flexDirection: 'row',
          gap: t.spacing.md + 2,
          marginBottom: t.spacing.xl
        }}
      >
        <Text
          style={{
            ...t.type.gutter,
            color: t.colors.text.tertiary,
            width: 28,
            textAlign: 'right',
            paddingTop: 2
          }}
        >
          {indexStr}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={{ ...t.type.bodyUserV2, color: t.colors.text.secondary }}>
            <Text style={{ color: t.colors.text.quiet }}>{'$ '}</Text>
            {message.content}
          </Text>
          <Text
            style={{
              ...t.type.metaV2,
              color: t.colors.text.quiet,
              marginTop: 6
            }}
          >
            {metaForMessage(message, false)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: t.spacing.md + 2,
        marginBottom: t.spacing.xl
      }}
    >
      <Text
        style={{
          ...t.type.gutter,
          color: t.colors.accent.warm,
          width: 28,
          textAlign: 'right',
          paddingTop: 2
        }}
      >
        ↳
      </Text>
      <View style={{ flex: 1 }}>
        <Markdown
          style={{
            body: { ...t.type.bodyAiV2, color: t.colors.text.primary },
            code_inline: {
              backgroundColor: t.colors.bg.subtle,
              fontFamily: t.fonts.mono,
              fontSize: 14,
              paddingHorizontal: 5,
              borderRadius: 2,
              color: t.colors.text.primary
            },
            fence: {
              backgroundColor: t.colors.bg.subtle,
              fontFamily: t.fonts.mono,
              fontSize: 13,
              padding: t.spacing.sm,
              borderRadius: 4,
              color: t.colors.text.primary
            },
            paragraph: { marginTop: 0, marginBottom: t.spacing.sm }
          }}
        >
          {/*
            Defense in depth: re-run the reasoning strip at render time so
            messages persisted from earlier app versions (which may have
            stored raw `<think>` / `<|channel|>` markup) still display
            cleanly. Idempotent — running it on already-stripped content
            is a no-op.
          */}
          {stripReasoning(message.content) || ' '}
        </Markdown>
        {isStreaming ? <StreamingCursor /> : null}
        {hasReasoning ? (
          <Pressable
            onPress={() => setShowThinking((v) => !v)}
            style={{
              marginTop: t.spacing.xs,
              paddingVertical: 4,
              alignSelf: 'flex-start'
            }}
          >
            <Text
              style={{
                ...t.type.metaV2,
                color: t.colors.text.tertiary
              }}
            >
              {showThinking ? '▾ thinking' : '▸ thinking'}
            </Text>
          </Pressable>
        ) : null}
        {hasReasoning && showThinking ? (
          <View
            style={{
              marginTop: t.spacing.xs,
              paddingLeft: t.spacing.sm,
              borderLeftWidth: 2,
              borderLeftColor: t.colors.bg.subtle
            }}
          >
            <Text
              style={{
                ...t.type.bodyAiV2,
                color: t.colors.text.tertiary,
                fontStyle: 'italic'
              }}
            >
              {reasoning}
            </Text>
          </View>
        ) : null}
        {hasToolCalls ? (
          <Pressable
            onPress={() => setShowTools((v) => !v)}
            style={{
              marginTop: t.spacing.xs,
              paddingVertical: 4,
              alignSelf: 'flex-start'
            }}
          >
            <Text
              style={{
                ...t.type.metaV2,
                color: t.colors.text.tertiary
              }}
            >
              {showTools ? '▾' : '▸'} {toolsLabel}
            </Text>
          </Pressable>
        ) : null}
        {hasToolCalls && showTools ? (
          <View
            style={{
              marginTop: t.spacing.xs,
              paddingLeft: t.spacing.sm,
              borderLeftWidth: 2,
              borderLeftColor: t.colors.bg.subtle,
              gap: t.spacing.sm
            }}
          >
            {toolCalls.map((call, i) => (
              <View key={i}>
                <Text
                  style={{
                    ...t.type.metaV2,
                    color: t.colors.text.secondary,
                    fontFamily: t.fonts.mono
                  }}
                >
                  {call.name}({summarizeArgs(call.args)})
                </Text>
                <Text
                  style={{
                    ...t.type.metaV2,
                    color: call.error ? t.colors.accent.warm : t.colors.text.tertiary,
                    marginTop: 2
                  }}
                >
                  {call.error ? `↳ error: ${call.error}` : `↳ ${call.result}`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text
          style={{
            ...t.type.metaV2,
            color: t.colors.text.quiet,
            marginTop: 6
          }}
        >
          {metaForMessage(message, isStreaming)}
        </Text>
      </View>
    </View>
  );
};
