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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { SearchHit, searchMessages } from '@/db/search';
import { AsciiBlock } from '../components/AsciiBlock';
import { FenceBox } from '../components/FenceBox';

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return d.toISOString().slice(0, 10);
};

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
    <Text
      numberOfLines={2}
      style={{
        fontFamily: 'serif',
        fontSize: 14,
        lineHeight: 21,
        color: baseColor
      }}
    >
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
  const insets = useSafeAreaInsets();
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
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + t.spacing.md,
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border.subtle,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md
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
          <Text style={{ fontFamily: t.fonts.mono, fontSize: 14 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ ...t.type.meta, color: t.colors.accent.warm }}>~/search</Text>
          <Text style={{ ...t.type.displaySerifLg, color: t.colors.text.primary }}>
            search
          </Text>
        </View>
      </View>

      {/* Query box */}
      <View style={{ padding: t.spacing.xl, paddingBottom: t.spacing.sm }}>
        <FenceBox lang="match" paddingV={t.spacing.sm} paddingH={t.spacing.md}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Text
              style={{
                fontFamily: t.fonts.mono,
                fontSize: 13,
                color: t.colors.text.tertiary
              }}
            >
              $
            </Text>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="search every message"
              placeholderTextColor={t.colors.text.quiet}
              autoCorrect={false}
              autoCapitalize="none"
              style={{
                flex: 1,
                fontFamily: t.fonts.mono,
                fontSize: 13,
                lineHeight: 20,
                color: t.colors.text.primary
              }}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>×</Text>
              </Pressable>
            ) : null}
          </View>
        </FenceBox>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: t.spacing.sm + 2
          }}
        >
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            {loading
              ? 'searching…'
              : query.trim()
                ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'} · FTS5 + prefix`
                : 'type to search across all conversations'}
          </Text>
          {loading ? <ActivityIndicator size="small" color={t.colors.text.tertiary} /> : null}
        </View>
      </View>

      {/* Results */}
      {hits.length === 0 && query.trim() && !loading ? (
        <View style={{ padding: t.spacing.xl, alignItems: 'center', gap: t.spacing.md }}>
          <AsciiBlock>{'  ( no matches )'}</AsciiBlock>
          <Text style={{ ...t.type.meta, color: t.colors.text.quiet, textAlign: 'center' }}>
            FTS5 needs at least one full word in common. Try a different keyword or a shorter
            substring.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={hits}
        keyExtractor={(h) => h.message_id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + t.spacing.xxl }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => router.push(`/conversation/${item.conversation_id}`)}
            style={{
              flexDirection: 'row',
              gap: t.spacing.md,
              paddingHorizontal: t.spacing.xl,
              paddingVertical: t.spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.border.subtle
            }}
          >
            <Text
              style={{
                ...t.type.gutter,
                color: t.colors.text.quiet,
                width: 28,
                textAlign: 'right',
                paddingTop: 2
              }}
            >
              {String(index + 1).padStart(2, '0')}
            </Text>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline'
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
              <Text style={{ ...t.type.metaV2, color: t.colors.text.quiet, marginVertical: 4 }}>
                {item.role === 'user'
                  ? '$ you'
                  : item.role === 'assistant'
                    ? '↳ assistant'
                    : '~ system'}
              </Text>
              <Snippet
                text={item.snippet}
                highlightColor={t.colors.accent.warm}
                baseColor={t.colors.text.secondary}
              />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
};
