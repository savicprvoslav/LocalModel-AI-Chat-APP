import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
};

/**
 * Themed stepper. We don't use a continuous slider on purpose — discrete steps
 * are easier to hit precisely on mobile and match the values our model
 * runtimes actually accept (powers-of-two for ctx, etc).
 */
export const StepSlider = ({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange
}: Props) => {
  const t = useTheme();
  const display = format ? format(value) : String(value);
  const fraction = (value - min) / (max - min || 1);

  const stepBtnStyle = {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderWidth: 1,
    borderColor: t.colors.border.default,
    borderRadius: t.radii.sm
  };

  const decrement = () => onChange(Math.max(min, +(value - step).toFixed(6)));
  const increment = () => onChange(Math.min(max, +(value + step).toFixed(6)));

  return (
    <View style={{ marginBottom: t.spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: t.spacing.xs
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>{label}</Text>
        <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary }}>{display}</Text>
      </View>
      {hint ? (
        <Text
          style={{ ...t.type.meta, color: t.colors.text.quiet, marginBottom: t.spacing.sm }}
        >
          {hint}
        </Text>
      ) : null}
      <View
        style={{
          height: 4,
          backgroundColor: t.colors.bg.subtle,
          borderRadius: t.radii.sm,
          marginBottom: t.spacing.sm
        }}
      >
        <View
          style={{
            width: `${Math.max(0, Math.min(100, fraction * 100))}%`,
            height: '100%',
            backgroundColor: t.colors.text.primary,
            borderRadius: t.radii.sm
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <Pressable
          onPress={decrement}
          disabled={value <= min}
          style={{ ...stepBtnStyle, opacity: value <= min ? 0.4 : 1 }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>−</Text>
        </Pressable>
        <Pressable
          onPress={increment}
          disabled={value >= max}
          style={{ ...stepBtnStyle, opacity: value >= max ? 0.4 : 1 }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
};
