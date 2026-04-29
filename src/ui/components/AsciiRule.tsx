import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  /** Number of dash characters. Default 40 — same as the design. */
  width?: number;
  marker?: string;
};

/**
 * Decorative ASCII horizontal rule, e.g. `────────────────────`.
 * Mono, quiet, single line, never wraps.
 */
export const AsciiRule = ({ width = 40, marker = '─' }: Props) => {
  const t = useTheme();
  return (
    <View style={{ overflow: 'hidden', height: 14 }}>
      <Text
        numberOfLines={1}
        ellipsizeMode="clip"
        style={{
          fontFamily: t.fonts.mono,
          fontSize: 10,
          lineHeight: 14,
          color: t.colors.text.quiet
        }}
      >
        {marker.repeat(width)}
      </Text>
    </View>
  );
};
