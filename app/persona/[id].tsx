import { useLocalSearchParams } from 'expo-router';
import { PersonaEditScreen } from '@/ui/screens/PersonaEditScreen';

export default function PersonaEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <PersonaEditScreen personaId={id} />;
}
