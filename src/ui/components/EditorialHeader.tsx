import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { DotPulse } from './DotPulse';

type Props = {
  /** Mono-uppercase eyebrow above the title, e.g. "LOCAL · ONLINE · 12 CHATS". */
  eyebrow?: string;
  /** Whether to show a pulsing warm dot before the eyebrow text. */
  pulse?: boolean;
  /** The big serif title — e.g. "conversations". */
  title: string;
  /** Italic serif subtitle directly under the title. */
  subtitle?: string;
  /** Optional row of action buttons rendered below the subtitle. */
  actions?: ReactNode;
};

/**
 * Editorial page header — mono eyebrow + huge serif title + italic subtitle.
 * The "wow" element of the V2 home screen. Replaces a dense, mono-only
 * top bar with literary breathing room.
 */
export const EditorialHeader = ({ eyebrow, pulse, title, subtitle, actions }: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + t.spacing.lg,
        paddingHorizontal: t.spacing.xl,
        paddingBottom: t.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border.subtle
      }}
    >
      {eyebrow ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            marginBottom: t.spacing.sm
          }}
        >
          {pulse ? <DotPulse /> : null}
          <Text style={{ ...t.type.eyebrow, color: t.colors.accent.warm }}>{eyebrow}</Text>
        </View>
      ) : null}
      <Text
        style={{
          ...t.type.editorialTitle,
          color: t.colors.text.primary,
          marginBottom: t.spacing.xs - 2
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ ...t.type.editorialSub, color: t.colors.text.secondary }}>
          {subtitle}
        </Text>
      ) : null}
      {actions ? <View style={{ marginTop: t.spacing.lg }}>{actions}</View> : null}
    </View>
  );
};
