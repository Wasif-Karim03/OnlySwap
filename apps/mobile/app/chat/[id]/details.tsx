import { useLocalSearchParams } from 'expo-router';

import { ChatDetailsScreen } from '@/features/chat/ChatDetailsScreen';

export default function ChatDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatDetailsScreen id={id} />;
}
