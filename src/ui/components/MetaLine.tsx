import { ReactNode } from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = { children: ReactNode; style?: StyleProp<ViewStyle> };

export const MetaLine = ({ children, style }: Props) => {
  const t = useTheme();
  return (
    <View style={style}>
      <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>{children}</Text>
    </View>
  );
};
