import { createContext, useContext } from 'react';
import { darkTokens, lightTokens, ColorTokens, spacing, radii } from './tokens';
import { type, fonts } from './typography';

export type ThemeMode = 'light' | 'dark';
export type Theme = {
  mode: ThemeMode;
  colors: ColorTokens;
  type: typeof type;
  fonts: typeof fonts;
  spacing: typeof spacing;
  radii: typeof radii;
};

export const buildTheme = (mode: ThemeMode): Theme => ({
  mode,
  colors: mode === 'dark' ? darkTokens : lightTokens,
  type,
  fonts,
  spacing,
  radii
});

export const ThemeContext = createContext<Theme>(buildTheme('dark'));
export const useTheme = (): Theme => useContext(ThemeContext);
