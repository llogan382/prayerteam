// PROTOTYPE — throwaway. Floating variant switcher; dev builds only.
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

export function PrototypeSwitcher({ variants, current }: { variants: { key: string; name: string }[]; current: string }) {
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (delta: number) => router.setParams({ variant: variants[(i + delta + variants.length) % variants.length].key });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!__DEV__) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', zIndex: 1000 }}>
      <View className="flex-row items-center gap-1 rounded-full bg-fuchsia-700 px-2 py-1" style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>
        <Pressable onPress={() => go(-1)} className="px-3 py-1">
          <Text className="text-lg font-bold text-white">←</Text>
        </Pressable>
        <Text className="font-mono text-sm text-white">
          {variants[i].key} ({variants[i].name})
        </Text>
        <Pressable onPress={() => go(1)} className="px-3 py-1">
          <Text className="text-lg font-bold text-white">→</Text>
        </Pressable>
      </View>
    </View>
  );
}
