// PROTOTYPE — throwaway. Three variants of the core loop (feed → request → thread → compose)
// on one route, switchable via ?variant=A|B|C and the floating bar (← → keys on web).
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { PrototypeSwitcher } from '@/prototype/switcher';
import { VariantA } from '@/prototype/variant-a';
import { VariantB } from '@/prototype/variant-b';
import { VariantC } from '@/prototype/variant-c';

const VARIANTS = [
  { key: 'A', name: 'Classic list' },
  { key: 'B', name: 'Prayer time' },
  { key: 'C', name: 'Conversation' },
];

export default function CorePrototype() {
  const { variant = 'A' } = useLocalSearchParams<{ variant?: string }>();
  return (
    <View className="flex-1">
      {variant === 'A' && <VariantA />}
      {variant === 'B' && <VariantB />}
      {variant === 'C' && <VariantC />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </View>
  );
}
