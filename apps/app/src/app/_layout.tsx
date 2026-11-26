import '../global.css';

import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmProvider } from '@/prototype/platform';
import { StoreProvider } from '@/prototype/store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <StoreProvider>
          <ConfirmProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </ConfirmProvider>
        </StoreProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
