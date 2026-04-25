import { Platform, TextStyle } from 'react-native';

const monoStack = Platform.select({
  ios: 'JetBrainsMono-Regular',
  android: 'JetBrainsMono-Regular',
  default: 'monospace'
}) ?? 'monospace';

const monoBoldStack = Platform.select({
  ios: 'JetBrainsMono-Bold',
  android: 'JetBrainsMono-Bold',
  default: 'monospace'
}) ?? 'monospace';

const serifStack = Platform.select({
  ios: 'Charter',
  android: 'serif',
  default: 'serif'
}) ?? 'serif';

export const fonts = {
  mono: monoStack,
  monoBold: monoBoldStack,
  serif: serifStack
};

export type TypeStyle = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight' | 'textTransform'
>;

export const type: Record<
  'heading' | 'bodyAi' | 'bodyUser' | 'meta' | 'label' | 'kbd',
  TypeStyle
> = {
  heading: { fontFamily: fonts.monoBold, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  bodyAi: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 25 },
  bodyUser: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 15 },
  label: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 14
  },
  kbd: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }
};
