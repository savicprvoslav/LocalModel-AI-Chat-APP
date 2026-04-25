import { useLocalSearchParams } from 'expo-router';
import { ProjectDetailScreen } from '@/ui/screens/ProjectDetailScreen';

export default function Project() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ProjectDetailScreen projectId={id} />;
}
