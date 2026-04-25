import { router } from 'expo-router';
import { FirstRunScreen } from '@/ui/screens/FirstRunScreen';

export default function FirstRun() {
  return <FirstRunScreen onComplete={() => router.replace('/')} />;
}
