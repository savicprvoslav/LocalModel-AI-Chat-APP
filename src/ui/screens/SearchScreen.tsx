import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { SearchHit, searchMessages } from '@/db/search';

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return d.toISOString().slice(0, 10);
};

/**
 * Render a single snippet line with `«match»` markers replaced by themed
 * highlighted text. Falls back to a plain Text if there are no markers.
 */
const Snippet = ({
  text,
  highlightColor,
  baseColor
}: {
  text: string;
  highlightColor: string;
  baseColor: string;
}) => {
  const parts = text.split(/«([^»]*)»/g);
  return (
    <Text style={{ color: baseColor }} numberOfLines={2}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ color: highlightColor, fontWeight: '600' }}>
            {p}
          </Text>
        ) : (
          <Text key={i}>{p}</Text>
        )
      )}
    </Text>
  );
};

export const SearchScreen = () => {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const next = await searchMessages(query);
        setHits(next);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, [query]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title="search"
      />
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            borderRadius: t.radii.sm,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm
          }}
        >
          <Text style={{ ...t.type.bodyUser, color: t.colors.text.tertiary }}>$</Text>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="search all messages…"
            placeholderTextColor={t.colors.text.quiet}
            autoCorrect={false}
            autoCapitalize="none"
            style={{ ...t.type.bodyUser, color: t.colors.text.primary, flex: 1 }}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>×</Text>
            </Pressable>
          ) : null}
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: t.spacing.sm
          }}
        >
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            {loading
              ? 'searching…'
              : query.trim()
                ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`
                : 'type to search across all conversations'}
          </Text>
          {loading ? <ActivityIndicator size="small" color={t.colors.text.tertiary} /> : null}
        </View>
      </View>

      <FlatList
        data={hits}
        keyExtractor={(h) => h.message_id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: t.spacing.xxl }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/conversation/${item.conversation_id}`)}
            style={{
              paddingHorizontal: t.spacing.lg,
              paddingVertical: t.spacing.sm + 2,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.border.subtle
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 2
              }}
            >
              <Text
                style={{ ...t.type.label, color: t.colors.text.tertiary, flex: 1 }}
                numberOfLines={1}
              >
                {item.project_name ? `~/${item.project_name.toUpperCase()}/` : '~/INBOX/'}
                {item.conversation_title.toUpperCase()}
              </Text>
              <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
                {formatTime(item.created_at)}
              </Text>
            </View>
            <Text
              style={{ ...t.type.meta, color: t.colors.text.quiet, marginBottom: 2 }}
            >
              {item.role === 'user' ? '> you' : item.role === 'assistant' ? 'assistant' : 'system'}
            </Text>
            <Snippet
              text={item.snippet}
              highlightColor={t.colors.accent.warm}
              baseColor={t.colors.text.secondary}
            />
          </Pressable>
        )}
      />
    </View>
  );
};
