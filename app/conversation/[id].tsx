import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/ui/screens/ConversationScreen';

export default function Conversation() {
  const { id, starter } = useLocalSearchParams<{ id: string; starter?: string }>();
  if (!id) return null;
  return (
    <ConversationScreen
      conversationId={id}
      starterText={typeof starter === 'string' ? starter : undefined}
    />
  );
}
