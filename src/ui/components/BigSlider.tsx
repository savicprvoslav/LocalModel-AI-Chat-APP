import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Bar } from './Bar';

type Props = {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Display formatter for the big numeral. */
  format?: (v: number) => string;
  /** Small uppercase unit shown after the value, e.g. "tok". */
  unit?: string;
  onChange: (v: number) => void;
};

/**
 * V2 slider — the live value renders as a 40px mono numeral, the bar
 * shows fraction, and ± step buttons sit below. Discrete steps because
 * powers-of-two and round numbers map better to the underlying settings.
 *
 * Replaces StepSlider in the V2 Settings screen.
 */
export const BigSlider = ({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  unit,
  onChange
}: Props) => {
  const t = useTheme();
  const fraction = (value - min) / (max - min || 1);
  const display = format ? format(value) : String(value);

  const stepBtn = {
    flex: 1,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: t.colors.border.default,
    borderRadius: t.radii.sm,
    alignItems: 'center' as const
  };

  const decrement = () => onChange(Math.max(min, +(value - step).toFixed(6)));
  const increment = () => onChange(Math.min(max, +(value + step).toFixed(6)));
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.colors.border.subtle,
        borderRadius: t.radii.sm,
        padding: t.spacing.md + 2,
        marginBottom: t.spacing.md
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: t.spacing.xs
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>{label}</Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>{`${min}–${max}`}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
        <Text style={{ ...t.type.bigNumeral, color: t.colors.text.primary }}>{display}</Text>
        {unit ? (
          <Text
            style={{
              ...t.type.meta,
              color: t.colors.text.quiet,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginLeft: 6
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      {hint ? (
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.text.quiet,
            marginBottom: t.spacing.sm + 2
          }}
        >
          {hint}
        </Text>
      ) : null}
      <View style={{ marginBottom: t.spacing.sm + 2 }}>
        <Bar fraction={fraction} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable
          onPress={decrement}
          disabled={atMin}
          style={{ ...stepBtn, opacity: atMin ? 0.4 : 1 }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>−</Text>
        </Pressable>
        <Pressable
          onPress={increment}
          disabled={atMax}
          style={{ ...stepBtn, opacity: atMax ? 0.4 : 1 }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
};
