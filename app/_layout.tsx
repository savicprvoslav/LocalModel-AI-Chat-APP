import { Stack } from 'expo-router';
import { AppProviders } from '@/providers';

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }} />
    </AppProviders>
  );
}
