import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Skill } from '@/db/skills';

type Props = {
  /** The query after the leading `/`, e.g. "cave" from `/cave`. Empty = show all. */
  query: string;
  /** Full list of skills; component filters internally. */
  skills: Skill[];
  /** Maximum results to show. Default 5 — keeps the menu thumb-sized. */
  limit?: number;
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
 * Designed to live in the composer's flow (not a Modal/portal), so it
 * pushes the textarea down a little while active. Cleaner than overlaying.
 */
export const SlashMenu = ({ query, skills, limit = 5, onSelect }: Props) => {
  const t = useTheme();
  const q = query.toLowerCase().trim();
  const matches = skills
    .filter((s) => {
      const name = s.name.toLowerCase().replace(/\s+/g, '-');
      return q.length === 0 || name.startsWith(q);
    })
    .slice(0, limit);

  if (matches.length === 0) return null;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: t.colors.border.subtle,
        backgroundColor: t.colors.bg.elevated,
        paddingVertical: t.spacing.xs
      }}
    >
      <Text
        style={{
          ...t.type.label,
          color: t.colors.text.tertiary,
          paddingHorizontal: t.spacing.md + 2,
          paddingTop: t.spacing.xs,
          paddingBottom: t.spacing.xs
        }}
      >
        $ skills · pick one
      </Text>
      {matches.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => onSelect(s)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.md + 2,
            paddingVertical: t.spacing.sm,
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
    </View>
  );
};
