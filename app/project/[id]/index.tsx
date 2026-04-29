import { useLocalSearchParams } from 'expo-router';
import { ProjectThreadsScreen } from '@/ui/screens/ProjectThreadsScreen';

export default function ProjectThreads() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ProjectThreadsScreen projectId={id} />;
}
