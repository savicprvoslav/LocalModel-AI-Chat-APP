import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Skill } from '@/db/skills';

type Props = {
  /** The query after the leading `/`, e.g. "cave" from `/cave`. Empty = show all. */
  query: string;
  /** Full list of skills; component filters internally. */
  skills: Skill[];
  /** Tapped a skill — caller should strip the slash command from the input
   *  and apply the skill to the active conversation. */
  onSelect: (skill: Skill) => void;
};

/**
 * Inline autocomplete that appears above the composer when the user types
 * `/` as the first character. Filters skills by name prefix, case-insensitive.
 *
 * Renders nothing if there are no matches — the composer behaves normally
 * and the user's `/whatever` text gets sent as-is when they press send.
 *
 * Lives in the composer's flow (not a Modal/portal). Bounded height with
 * an inner ScrollView so the full skill list is reachable even with a
 * dozen+ entries — the previous version capped at 5 with no scroll.
 */
const ROW_HEIGHT = 46;
const HEADER_HEIGHT = 28;
const MAX_VISIBLE_ROWS = 4;

export const SlashMenu = ({ query, skills, onSelect }: Props) => {
  const t = useTheme();
  const q = query.toLowerCase().trim();
  const matches = skills.filter((s) => {
    const name = s.name.toLowerCase().replace(/\s+/g, '-');
    return q.length === 0 || name.startsWith(q);
  });

  if (matches.length === 0) return null;

  // Height: the menu shrinks to fit when there are few results, then
  // caps at MAX_VISIBLE_ROWS and the rest scrolls. Keeps the textarea
  // visible even with the keyboard up.
  const visibleRows = Math.min(matches.length, MAX_VISIBLE_ROWS);
  const cappedHeight = HEADER_HEIGHT + visibleRows * ROW_HEIGHT;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: t.colors.border.subtle,
        backgroundColor: t.colors.bg.elevated
      }}
    >
      <View
        style={{
          height: HEADER_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: t.spacing.md + 2
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
          $ skills · pick one
        </Text>
        {matches.length > MAX_VISIBLE_ROWS ? (
          <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
            {`${matches.length} matches · scroll`}
          </Text>
        ) : null}
      </View>
      <ScrollView
        style={{ maxHeight: cappedHeight - HEADER_HEIGHT }}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator
      >
        {matches.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => onSelect(s)}
            style={({ pressed }) => ({
              height: ROW_HEIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              paddingHorizontal: t.spacing.md + 2,
              backgroundColor: pressed ? t.colors.bg.subtle : 'transparent'
            })}
          >
            <Text
              style={{
                fontFamily: t.fonts.mono,
                fontSize: 13,
                color: t.colors.accent.warm,
                minWidth: 16
              }}
            >
              /
            </Text>
            <Text
              style={{
                ...t.type.bodyUserV2,
                color: t.colors.text.primary,
                minWidth: 80
              }}
            >
              {s.name.toLowerCase()}
            </Text>
            <Text
              style={{
                ...t.type.meta,
                color: t.colors.text.quiet,
                flex: 1
              }}
              numberOfLines={1}
            >
              {s.description}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
