import { ReactNode, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeContext, buildTheme, ThemeMode } from './useTheme';

type Props = {
  children: ReactNode;
  override?: ThemeMode | 'system';
};

export const ThemeProvider = ({ children, override = 'system' }: Props) => {
  const sys = useColorScheme();
  const mode: ThemeMode = useMemo(() => {
    if (override === 'system') return sys === 'light' ? 'light' : 'dark';
    return override;
  }, [override, sys]);
  const theme = useMemo(() => buildTheme(mode), [mode]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};
