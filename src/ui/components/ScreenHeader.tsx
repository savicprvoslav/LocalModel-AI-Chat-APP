import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  left?: ReactNode;
  title?: string;
  right?: ReactNode;
};

export const ScreenHeader = ({ left, title, right }: Props) => {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: t.spacing.lg,
        paddingTop: t.spacing.md,
        paddingBottom: t.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border.subtle,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm
      }}
    >
      <View>{left}</View>
      <View style={{ flex: 1 }}>
        {title ? (
          <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>{title}</Text>
        ) : null}
      </View>
      <View>{right}</View>
    </View>
  );
};
