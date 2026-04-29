import { ReactNode, useEffect, useMemo, useState, createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeContext, buildTheme, ThemeMode } from './useTheme';
import { getSetting, setSetting, Theme as ThemePref } from '@/db/settings';

type Props = {
  children: ReactNode;
  override?: ThemeMode | 'system';
};

type ThemePrefContextValue = {
  pref: ThemePref;
  setPref: (next: ThemePref) => Promise<void>;
};

const ThemePrefContext = createContext<ThemePrefContextValue>({
  pref: 'system',
  setPref: async () => undefined
});

export const useThemePref = (): ThemePrefContextValue => useContext(ThemePrefContext);

export const ThemeProvider = ({ children, override }: Props) => {
  const sys = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    if (override) return; // when override is passed explicitly we don't load persisted pref
    void (async () => {
      try {
        setPrefState(await getSetting('theme'));
      } catch {
        // db not ready yet — stay on default
      }
    })();
  }, [override]);

  const mode: ThemeMode = useMemo(() => {
    const effective: ThemePref | ThemeMode = override ?? pref;
    if (effective === 'system') return sys === 'light' ? 'light' : 'dark';
    return effective;
  }, [override, pref, sys]);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  const setPref = async (next: ThemePref): Promise<void> => {
    setPrefState(next);
    await setSetting('theme', next);
  };

  return (
    <ThemePrefContext.Provider value={{ pref, setPref }}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </ThemePrefContext.Provider>
  );
};
