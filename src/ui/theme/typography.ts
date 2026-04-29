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

const monoLightStack = Platform.select({
  // No light JetBrains Mono shipped — use regular for both.
  ios: 'JetBrainsMono-Regular',
  android: 'JetBrainsMono-Regular',
  default: 'monospace'
}) ?? 'monospace';

const serifStack = Platform.select({
  ios: 'Charter',
  android: 'serif',
  default: 'serif'
}) ?? 'serif';

const serifItalicStack = Platform.select({
  ios: 'Charter-Italic',
  android: 'serif',
  default: 'serif'
}) ?? 'serif';

export const fonts = {
  mono: monoStack,
  monoBold: monoBoldStack,
  monoLight: monoLightStack,
  serif: serifStack,
  serifItalic: serifItalicStack
};

export type TypeStyle = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight' | 'textTransform' | 'fontStyle'
>;

/**
 * Type scale.
 *
 * V1 styles (heading, bodyAi, bodyUser, meta, label, kbd) are kept verbatim
 * for components that haven't been ported to V2 yet.
 *
 * V2 styles (display*, big*, ascii*, eyebrow, editorial*, bodyAiV2,
 * bodyUserV2, metaV2, gutter) are the "stunning" direction: terminal-
 * romantic + editorial. Larger serif moments, tabular-num numerals,
 * mono ASCII decoration.
 */
export const type: Record<
  | 'heading'
  | 'bodyAi'
  | 'bodyUser'
  | 'meta'
  | 'label'
  | 'kbd'
  // V2 additions:
  | 'eyebrow'
  | 'editorialTitle'
  | 'editorialSub'
  | 'displaySerif'
  | 'displaySerifLg'
  | 'bodyAiV2'
  | 'bodyUserV2'
  | 'metaV2'
  | 'bigNumeral'
  | 'numeralLg'
  | 'numeralXl'
  | 'gutter'
  | 'ascii'
  | 'asciiSmall',
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
  kbd: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 },

  // ---- V2 ----
  eyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: 14
  },
  editorialTitle: {
    fontFamily: fonts.serif,
    fontSize: 36,
    fontWeight: '400',
    letterSpacing: -0.5,
    lineHeight: 40
  },
  editorialSub: {
    fontFamily: fonts.serifItalic,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 22
  },
  displaySerif: {
    fontFamily: fonts.serif,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.2,
    lineHeight: 22
  },
  displaySerifLg: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: -0.3,
    lineHeight: 30
  },
  bodyAiV2: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 27
  },
  bodyUserV2: {
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 21
  },
  metaV2: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
    lineHeight: 14
  },
  bigNumeral: {
    fontFamily: fonts.mono,
    fontSize: 40,
    fontWeight: '300',
    letterSpacing: -1.2,
    lineHeight: 40
  },
  numeralLg: {
    fontFamily: fonts.mono,
    fontSize: 32,
    fontWeight: '300',
    letterSpacing: -1.2,
    lineHeight: 32
  },
  numeralXl: {
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 22
  },
  gutter: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    lineHeight: 14
  },
  ascii: {
    fontFamily: fonts.mono,
    fontSize: 9,
    lineHeight: 11
  },
  asciiSmall: {
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 13
  }
};
