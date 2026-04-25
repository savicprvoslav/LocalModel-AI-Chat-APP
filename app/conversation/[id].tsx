import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/ui/screens/ConversationScreen';

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ConversationScreen conversationId={id} />;
}
