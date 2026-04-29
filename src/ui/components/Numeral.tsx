import { Text } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  children: string | number;
  size?: 'lg' | 'xl' | 'big';
  /** Active = warm-orange instead of quiet. Used on selected model cards. */
  active?: boolean;
};

const padTwo = (n: string | number): string => String(n).padStart(2, '0');

/**
 * Big mono numeral, tabular-nums, slightly tightened tracking. The
 * marginalia of the design — used as the gutter index next to model
 * cards (`01 / 02 / 03`), as the live value on sliders, etc.
 *
 * `lg` = 32px (model cards), `xl` = 22px (medium), `big` = 40px (slider value).
 */
export const Numeral = ({ children, size = 'lg', active }: Props) => {
  const t = useTheme();
  const style =
    size === 'big' ? t.type.bigNumeral : size === 'xl' ? t.type.numeralXl : t.type.numeralLg;
  return (
    <Text
      style={{
        ...style,
        color: active ? t.colors.accent.warm : t.colors.text.quiet
      }}
    >
      {typeof children === 'number' ? padTwo(children) : children}
    </Text>
  );
};
