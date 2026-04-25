import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useTheme } from '../theme/useTheme';

export const StreamingCursor = () => {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 525,
          easing: Easing.step1,
          useNativeDriver: true
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 525,
          easing: Easing.step1,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width: 7,
        height: 14,
        marginLeft: 2,
        opacity,
        backgroundColor: t.colors.text.primary,
        alignSelf: 'baseline'
      }}
    />
  );
};
