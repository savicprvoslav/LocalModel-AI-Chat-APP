import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  size?: number;
  /** Optional override; defaults to accent.warm. */
  color?: string;
};

/**
 * 6px round dot that breathes — opacity 1 → 0.4 → 1, 1.4s cycle.
 * Used to signal "live / online / streaming" without taking up space.
 */
export const DotPulse = ({ size = 6, color }: Props) => {
  const t = useTheme();
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color ?? t.colors.accent.warm,
        opacity: anim,
        transform: [
          {
            scale: anim.interpolate({ inputRange: [0.4, 1], outputRange: [0.8, 1] })
          }
        ]
      }}
    />
  );
};
