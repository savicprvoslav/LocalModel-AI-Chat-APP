import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

export type RetrievalSnippetView = {
  /** Cosine / hybrid score in [0, 1]. Rendered as e.g. `0.82`. */
  score: number;
  /** Source label e.g. `rust-cli · 4d ago` or `~/acme/board-prep`. */
  source: string;
  /** Short serif quote rendered with surrounding double-quotes. */
  excerpt: string;
};

type Props = {
  snippets: RetrievalSnippetView[];
};

/**
 * "Look what just happened" peek into the snippets that retrieval pulled
 * for this turn. Renders right after the warming log and disappears once
 * generation actually starts — its job is to make the v1.5 RAG visible
 * for the brief moment between "warmed up" and "first token".
 *
 * Quotes are rendered in serif at body-ai size to read as voice from
 * the past, not chrome.
 */
export const RetrievalPeek = ({ snippets }: Props) => {
  const t = useTheme();
  if (snippets.length === 0) return null;
  return (
    <View
      style={{
        borderLeftWidth: 2,
        borderLeftColor: t.colors.accent.warm,
        paddingLeft: t.spacing.md,
        paddingVertical: t.spacing.sm,
        marginBottom: t.spacing.lg,
        gap: t.spacing.sm
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline'
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>
          {`▢ RETRIEVED · ${snippets.length} ${snippets.length === 1 ? 'SNIPPET' : 'SNIPPETS'}`}
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          {`lexical · top ${snippets.length}`}
        </Text>
      </View>
      {snippets.map((s, i) => (
        <View
          key={`${i}-${s.source}`}
          style={{ flexDirection: 'row', gap: t.spacing.sm + 2 }}
        >
          <Text
            style={{
              fontFamily: t.fonts.mono,
              fontSize: 11,
              color: t.colors.text.tertiary,
              fontVariant: ['tabular-nums'],
              paddingTop: 4,
              minWidth: 36
            }}
          >
            {s.score.toFixed(2)}
          </Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: t.fonts.serif,
                fontSize: 14,
                lineHeight: 20,
                color: t.colors.text.secondary
              }}
            >
              {`"${s.excerpt}"`}
            </Text>
            <Text
              style={{
                ...t.type.metaV2,
                color: t.colors.text.quiet,
                marginTop: 2
              }}
            >
              {`— ${s.source}`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
};
