import { Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../theme/useTheme';
import { Message } from '@/db/messages';
import { StreamingCursor } from './StreamingCursor';
import { MetaLine } from './MetaLine';

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const metaForMessage = (m: Message, isStreaming: boolean): string => {
  const time = formatTime(m.created_at);
  if (isStreaming) return `${time} · streaming · ${m.token_count ?? 0} tok`;
  if (m.finish_reason === 'cancelled') return `${time} · stopped`;
  if (m.finish_reason === 'error') return `${time} · errored`;
  if (m.role === 'user') return `${time} · sent`;
  return `${time} · ${m.token_count ?? 0} tok`;
};

type Props = { message: Message; isStreaming: boolean };

export const MessageBubble = ({ message, isStreaming }: Props) => {
  const t = useTheme();

  if (message.role === 'user') {
    return (
      <View style={{ marginBottom: t.spacing.lg }}>
        <MetaLine style={{ marginBottom: t.spacing.xs }}>
          {metaForMessage(message, false)}
        </MetaLine>
        <View
          style={{
            paddingLeft: t.spacing.md,
            borderLeftWidth: 2,
            borderLeftColor: t.colors.border.default
          }}
        >
          <Text style={{ ...t.type.bodyUser, color: t.colors.text.secondary }}>
            <Text style={{ color: t.colors.text.quiet }}>{'> '}</Text>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: t.spacing.lg }}>
      <MetaLine style={{ marginBottom: t.spacing.xs }}>
        {metaForMessage(message, isStreaming)}
      </MetaLine>
      <View
        style={{
          paddingLeft: t.spacing.md,
          borderLeftWidth: 2,
          borderLeftColor: t.colors.text.primary
        }}
      >
        <Markdown
          style={{
            body: { ...t.type.bodyAi, color: t.colors.text.primary },
            code_inline: {
              backgroundColor: t.colors.bg.subtle,
              fontFamily: t.fonts.mono,
              fontSize: 14,
              paddingHorizontal: 5,
              borderRadius: 2
            },
            fence: {
              backgroundColor: t.colors.bg.subtle,
              fontFamily: t.fonts.mono,
              fontSize: 13,
              padding: t.spacing.sm,
              borderRadius: 4
            },
            paragraph: { marginTop: 0, marginBottom: t.spacing.sm }
          }}
        >
          {message.content || ' '}
        </Markdown>
        {isStreaming ? <StreamingCursor /> : null}
      </View>
    </View>
  );
};
