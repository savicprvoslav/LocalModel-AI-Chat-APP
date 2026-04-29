import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';

type Props = {
  left?: ReactNode;
  title?: string;
  /** When provided, the title becomes a pressable. */
  onTitlePress?: () => void;
  right?: ReactNode;
};

export const ScreenHeader = ({ left, title, onTitlePress, right }: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const titleEl = title ? (
    <Text style={{ ...t.type.heading, color: t.colors.text.primary }} numberOfLines={1}>
      {title}
    </Text>
  ) : null;

  return (
    <View
      style={{
        paddingHorizontal: t.spacing.lg,
        paddingTop: insets.top + t.spacing.sm,
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
        {onTitlePress && titleEl ? (
          <Pressable onPress={onTitlePress} hitSlop={6}>
            {titleEl}
          </Pressable>
        ) : (
          titleEl
        )}
      </View>
      <View>{right}</View>
    </View>
  );
};
