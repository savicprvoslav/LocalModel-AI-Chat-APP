import { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';

export type ActionKind = 'default' | 'warm' | 'destructive';

export type ActionSheetItem = {
  label: string;
  /** Visual treatment. Destructive renders the row text in warm-orange. */
  kind?: ActionKind;
  /** Optional left-side glyph (mono, fixed-width). Defaults sensibly per kind. */
  glyph?: string;
  /** Optional small right-side hint (e.g. keyboard shortcut). */
  hint?: string;
  /** Callback fired before the sheet auto-dismisses. */
  onPress?: () => void;
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Mono-uppercase label above the actions, e.g. `~/personas/concise`. */
  title?: string;
  /** Optional one-line description under the title. */
  subtitle?: string;
  actions: ActionSheetItem[];
  /** Optional ReactNode rendered between subtitle and the actions list. */
  header?: ReactNode;
};

const defaultGlyph = (kind: ActionKind): string =>
  kind === 'destructive' ? '✕' : kind === 'warm' ? '●' : '›';

/**
 * Themed bottom-sheet that replaces system Alert/ActionSheetIOS for any
 * "long-press shows a menu" or overflow-menu UX.
 *
 * Why custom: system sheets clash visually with the V2 chrome (white-ish
 * iOS sheet vs. our warm-dark canvas; and Android has no equivalent for
 * Alert.prompt). One sheet primitive ⇒ one consistent feel everywhere.
 *
 * Tap a row → fires `onPress` then auto-closes. Tap the scrim or CANCEL
 * to dismiss without action. ESC handled via Modal's onRequestClose.
 */
export const ActionSheet = ({
  visible,
  onClose,
  title,
  subtitle,
  actions,
  header
}: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const colorForKind = (kind: ActionKind | undefined): string => {
    if (kind === 'destructive') return t.colors.accent.warm;
    if (kind === 'warm') return t.colors.accent.warm;
    return t.colors.text.quiet;
  };

  const labelColorForKind = (kind: ActionKind | undefined): string =>
    kind === 'destructive' ? t.colors.accent.warm : t.colors.text.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end'
        }}
      >
        <Pressable
          // Stop propagation so taps inside the sheet don't dismiss it.
          onPress={() => undefined}
          style={{
            backgroundColor: t.colors.bg.elevated,
            borderTopLeftRadius: t.radii.lg,
            borderTopRightRadius: t.radii.lg,
            borderTopWidth: 1,
            borderTopColor: t.colors.border.default,
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.lg,
            paddingBottom: insets.bottom + t.spacing.lg
          }}
        >
          {title || subtitle ? (
            <View
              style={{
                paddingBottom: t.spacing.sm,
                marginBottom: t.spacing.xs,
                borderBottomWidth: 1,
                borderBottomColor: t.colors.border.subtle
              }}
            >
              {title ? (
                <Text
                  style={{
                    ...t.type.label,
                    color: t.colors.text.tertiary,
                    marginBottom: subtitle ? 4 : 0
                  }}
                >
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={{ ...t.type.meta, color: t.colors.text.secondary }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}

          {header ? <View style={{ marginBottom: t.spacing.xs }}>{header}</View> : null}

          {actions.map((a, i) => {
            const k = a.kind ?? 'default';
            const glyph = a.glyph ?? defaultGlyph(k);
            return (
              <Pressable
                key={`${i}-${a.label}`}
                disabled={a.disabled}
                onPress={() => {
                  a.onPress?.();
                  onClose();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  paddingVertical: t.spacing.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: t.colors.border.subtle,
                  opacity: a.disabled ? 0.4 : pressed ? 0.7 : 1
                })}
              >
                <Text
                  style={{
                    width: 18,
                    fontFamily: t.fonts.mono,
                    fontSize: 12,
                    color: colorForKind(k)
                  }}
                >
                  {glyph}
                </Text>
                <Text
                  style={{
                    ...t.type.bodyUserV2,
                    color: labelColorForKind(k),
                    flex: 1
                  }}
                >
                  {a.label}
                </Text>
                {a.hint ? (
                  <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
                    {a.hint}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}

          <Pressable
            onPress={onClose}
            style={{
              marginTop: t.spacing.xs,
              paddingVertical: t.spacing.md,
              alignItems: 'center'
            }}
          >
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>CANCEL</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
