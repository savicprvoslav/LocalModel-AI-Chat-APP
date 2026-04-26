import { useLocalSearchParams } from 'expo-router';
import { SkillEditScreen } from '@/ui/screens/SkillEditScreen';

export default function SkillEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <SkillEditScreen skillId={id} />;
}
