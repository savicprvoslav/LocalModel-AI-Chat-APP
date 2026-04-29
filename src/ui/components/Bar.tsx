import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  /** 0..1. Will be clamped. */
  fraction: number;
  warm?: boolean;
};

/**
 * Inline progress / utilization bar — 3px tall, warm-or-bone fill.
 * Used for: model size, RAM usage, generation progress, storage budget.
 */
export const Bar = ({ fraction, warm }: Props) => {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      style={{
        height: 3,
        backgroundColor: t.colors.bg.subtle,
        borderRadius: t.radii.sm,
        overflow: 'hidden'
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: warm ? t.colors.accent.warm : t.colors.text.primary
        }}
      />
    </View>
  );
};

type TicksProps = { labels: string[] };

/**
 * Small tick scale rendered as evenly-spaced labels in mono.
 * E.g. `<Ticks labels={['0', '2', '4', '6 GB']} />`.
 */
export const Ticks = ({ labels }: TicksProps) => {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4
      }}
    >
      {labels.map((l, i) => (
        <Text
          key={i}
          style={{
            fontFamily: t.fonts.mono,
            fontSize: 9,
            letterSpacing: 0.4,
            color: t.colors.text.quiet
          }}
        >
          {l}
        </Text>
      ))}
    </View>
  );
};
