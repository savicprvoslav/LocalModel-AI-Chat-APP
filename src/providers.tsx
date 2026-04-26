import { ReactNode, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './ui/theme/ThemeProvider';
import { initDb } from './db/db';

type Props = { children: ReactNode };

export const AppProviders = ({ children }: Props) => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDb()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[providers] db init failed:', error);
  }
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
};
