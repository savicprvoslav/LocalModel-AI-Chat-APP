import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  /** Optional small uppercase label that floats over the top-left border. */
  lang?: string;
  /** Override border color (e.g. accent.warm while streaming). */
  borderColor?: string;
  /** Padding inside the box. Defaults to (10, 12). */
  paddingV?: number;
  paddingH?: number;
  children: ReactNode;
};

/**
 * Code-fence container — a hairline box with an optional floating label
 * that sits over the top-left border. Used for status lines, callouts,
 * empty-state hints. The label is what gives this its "code-fence" feel.
 */
export const FenceBox = ({
  lang,
  borderColor,
  paddingV = 10,
  paddingH = 12,
  children
}: Props) => {
  const t = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: borderColor ?? t.colors.border.default,
        borderRadius: t.radii.sm,
        backgroundColor: t.colors.bg.subtle,
        paddingVertical: paddingV,
        paddingHorizontal: paddingH,
        position: 'relative'
      }}
    >
      {lang ? (
        <View
          style={{
            position: 'absolute',
            top: -7,
            left: 10,
            backgroundColor: t.colors.bg.canvas,
            paddingHorizontal: 6
          }}
        >
          <Text
            style={{
              ...t.type.metaV2,
              fontSize: 9,
              fontWeight: '600',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: t.colors.text.tertiary
            }}
          >
            {lang}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
};
