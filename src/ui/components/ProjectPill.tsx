import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = { name: string; onPress?: () => void };

export const ProjectPill = ({ name, onPress }: Props) => {
  const t = useTheme();
  const inner = (
    <View
      style={{
        paddingHorizontal: t.spacing.sm,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: t.colors.border.default,
        borderRadius: t.radii.sm
      }}
    >
      <Text style={{ ...t.type.label, color: t.colors.text.secondary, fontSize: 9.5 }}>
        {name.toUpperCase()}
      </Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
};
