import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { ConversationListScreen } from '@/ui/screens/ConversationListScreen';
import { getSetting } from '@/db/settings';
import { modelExists } from '@/model/storage';

export default function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const id = await getSetting('active_model_id');
      if (!id || !(await modelExists(id))) {
        router.replace('/first-run');
        return;
      }
      setReady(true);
    })();
  }, []);

  if (!ready)
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#161412' }}
      >
        <ActivityIndicator color="#ECE6D8" />
      </View>
    );
  return <ConversationListScreen />;
}
