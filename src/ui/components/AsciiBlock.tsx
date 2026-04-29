import { Text } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  children: string;
  warm?: boolean;
  /** Default 9 — tiny, decorative. Use 10/11 for slightly more legible blocks. */
  size?: number;
};

/**
 * Pre-formatted ASCII art block. Renders monospace with whitespace preserved.
 * Used for the welcome banner, rules, empty-state boxes.
 */
export const AsciiBlock = ({ children, warm, size = 9 }: Props) => {
  const t = useTheme();
  return (
    <Text
      selectable={false}
      style={{
        fontFamily: t.fonts.mono,
        fontSize: size,
        lineHeight: Math.round(size * 1.25),
        color: warm ? t.colors.accent.warm : t.colors.text.tertiary
      }}
    >
      {children}
    </Text>
  );
};
