// PROTOTYPE — throwaway. Web fallbacks for RN features React Native Web lacks:
// - Alert dialogs → in-app modal on web (Alert.alert on native)
// - pull-to-refresh (RefreshControl) → a "Refresh" row on web
// - text long-press → a visible "⋯" actions button everywhere (long-press is never the only path)
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { timeAgo, useStore } from './store';

const isWeb = Platform.OS === 'web';

type ConfirmOpts = { title: string; message?: string; confirm: string; destructive?: boolean; onConfirm: () => void };
const ConfirmCtx = createContext<(o: ConfirmOpts) => void>(() => {});

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ConfirmOpts | null>(null);
  const confirm = (o: ConfirmOpts) => {
    if (!isWeb) {
      Alert.alert(o.title, o.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: o.confirm, style: o.destructive ? 'destructive' : 'default', onPress: o.onConfirm },
      ]);
      return;
    }
    setOpen(o);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal transparent visible={!!open} animationType="fade" onRequestClose={() => setOpen(null)}>
        <View className="flex-1 items-center justify-center bg-black/40 p-6">
          <View className="w-full max-w-sm rounded-2xl bg-white p-5">
            <Text className="text-lg font-semibold text-stone-900">{open?.title}</Text>
            {open?.message ? <Text className="mt-2 text-stone-600">{open.message}</Text> : null}
            <View className="mt-5 flex-row justify-end gap-3">
              <Pressable onPress={() => setOpen(null)} className="rounded-lg px-4 py-2">
                <Text className="font-medium text-stone-600">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  open?.onConfirm();
                  setOpen(null);
                }}
                className={`rounded-lg px-4 py-2 ${open?.destructive ? 'bg-red-600' : 'bg-indigo-600'}`}>
                <Text className="font-medium text-white">{open?.confirm}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

export function RefreshableScroll({ children, className }: { children: ReactNode; className?: string }) {
  const [refreshing, setRefreshing] = useState(false);
  const [last, setLast] = useState(Date.now());
  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setLast(Date.now());
    }, 600);
  };
  return (
    <ScrollView
      className={className}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={isWeb ? undefined : <RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {isWeb ? (
        <Pressable onPress={refresh} className="items-center py-2">
          <Text className="text-xs text-stone-400">{refreshing ? 'Refreshing…' : `Updated ${timeAgo(last)} · ↻ Refresh`}</Text>
        </Pressable>
      ) : null}
      {children}
    </ScrollView>
  );
}

export type MenuItem = { label: string; destructive?: boolean; onPress: () => void };
export function ActionMenu({ items, dark }: { items: MenuItem[]; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} className="px-2 py-1" accessibilityLabel="More actions">
        <Text className={`text-xl ${dark ? 'text-white' : 'text-stone-500'}`}>⋯</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 justify-end bg-black/30">
          <View className="mx-auto w-full max-w-lg rounded-t-2xl bg-white pb-8 pt-2">
            {items.map((it) => (
              <Pressable
                key={it.label}
                onPress={() => {
                  setOpen(false);
                  it.onPress();
                }}
                className="px-6 py-4 active:bg-stone-100">
                <Text className={`text-base ${it.destructive ? 'text-red-600' : 'text-stone-800'}`}>{it.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// Standard request actions, shared so every variant offers the same verbs.
export function useRequestActions(id: string, onGone?: () => void): MenuItem[] {
  const { get, isMine, status, d, name } = useStore();
  const confirm = useConfirm();
  const r = get(id);
  if (!r) return [];
  if (isMine(r)) {
    const st = status(r);
    return [
      st === 'answered'
        ? { label: 'Un-mark Answered', onPress: () => d({ t: 'answered', id, on: false }) }
        : st === 'active'
          ? { label: 'Mark Answered 🎉', onPress: () => d({ t: 'answered', id, on: true }) }
          : null,
      st === 'archived'
        ? { label: 'Un-archive', onPress: () => d({ t: 'archived', id, on: false }) }
        : { label: 'Archive now', onPress: () => d({ t: 'archived', id, on: true }) },
      { label: 'Edit', onPress: () => {} },
      {
        label: 'Delete request',
        destructive: true,
        onPress: () =>
          confirm({
            title: 'Delete this request?',
            message: 'Its Updates and everyone’s Comments are deleted too. This can’t be undone.',
            confirm: 'Delete',
            destructive: true,
            onConfirm: () => {
              d({ t: 'delete', id });
              onGone?.();
            },
          }),
      },
    ].filter(Boolean) as MenuItem[];
  }
  return [
    { label: r.following ? 'Stop following' : 'Follow', onPress: () => d({ t: 'follow', id }) },
    {
      label: 'Report',
      destructive: true,
      onPress: () =>
        confirm({
          title: 'Report this request?',
          message: 'Your Church Admins will review it. It’s hidden for you straight away.',
          confirm: 'Report',
          destructive: true,
          onConfirm: () => {
            d({ t: 'report', id });
            onGone?.();
          },
        }),
    },
    ...(r.authorId
      ? [
          {
            label: `Block ${name(r.authorId)}`,
            destructive: true,
            onPress: () =>
              confirm({
                title: `Block ${name(r.authorId)}?`,
                message: 'You won’t see their requests or Comments. They aren’t told.',
                confirm: 'Block',
                destructive: true,
                onConfirm: () => {
                  d({ t: 'block', memberId: r.authorId! });
                  onGone?.();
                },
              }),
          },
        ]
      : []),
  ];
}

export function Bell({ onPress, dark }: { onPress: () => void; dark?: boolean }) {
  const { unread } = useStore();
  return (
    <Pressable onPress={onPress} className="relative px-2 py-1" accessibilityLabel={`Notifications, ${unread} unread`}>
      <Text className={`text-xl ${dark ? 'text-white' : ''}`}>🔔</Text>
      {unread > 0 ? (
        <View className="absolute right-0 top-0 min-w-[18px] items-center rounded-full bg-red-600 px-1">
          <Text className="text-[11px] font-bold text-white">{unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// Notification list + settings: shared across variants (not the question being asked).
export function NotificationsPanel({ onOpen, onClose }: { onOpen: (requestId: string) => void; onClose: () => void }) {
  const { s, d } = useStore();
  const [tab, setTab] = useState<'list' | 'settings'>('list');
  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center justify-between border-b border-stone-200 px-4 py-3">
        <Pressable onPress={onClose}>
          <Text className="text-indigo-600">‹ Back</Text>
        </Pressable>
        <View className="flex-row gap-4">
          {(['list', 'settings'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)}>
              <Text className={tab === t ? 'font-semibold text-stone-900' : 'text-stone-400'}>{t === 'list' ? 'Notifications' : 'Settings'}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => d({ t: 'readAll' })}>
          <Text className="text-xs text-indigo-600">{tab === 'list' ? 'Mark all read' : ''}</Text>
        </Pressable>
      </View>
      {tab === 'list' ? (
        <ScrollView>
          {s.notices.map((n) => (
            <Pressable key={n.id} onPress={() => n.requestId && onOpen(n.requestId)} className="flex-row items-start gap-3 border-b border-stone-100 px-4 py-3">
              <View className={`mt-2 h-2 w-2 rounded-full ${n.read ? 'bg-transparent' : 'bg-indigo-600'}`} />
              <View className="flex-1">
                <Text className="text-stone-800">{n.text}</Text>
                <Text className="text-xs text-stone-400">{timeAgo(n.at)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <ScrollView className="px-4">
          <Text className="mb-1 mt-4 text-xs font-semibold uppercase text-stone-400">Push notifications</Text>
          {(
            [
              ['prayed', 'Someone prays for my request'],
              ['activity', 'Updates and Comments on requests I follow'],
              ['newRequests', 'New requests in my Teams'],
            ] as const
          ).map(([k, label]) => (
            <View key={k} className="flex-row items-center justify-between py-3">
              <Text className="flex-1 text-stone-800">{label}</Text>
              <Switch value={s.push[k]} onValueChange={() => d({ t: 'push', key: k })} />
            </View>
          ))}
          <Text className="mb-1 mt-6 text-xs font-semibold uppercase text-stone-400">Mute a Team</Text>
          {s.teams.map((t) => (
            <View key={t.id} className="flex-row items-center justify-between py-3">
              <Text className="text-stone-800">{t.name}</Text>
              <Switch value={t.muted} onValueChange={() => d({ t: 'mute', teamId: t.id })} />
            </View>
          ))}
          <Text className="mt-4 text-xs text-stone-400">Push is iOS/Android only. On web, the bell list is the only alert.</Text>
        </ScrollView>
      )}
    </View>
  );
}

export function VisibilityNotice({ teamName }: { teamName: string }) {
  return (
    <View className="flex-row items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
      <Text>👁</Text>
      <Text className="flex-1 text-sm text-amber-900">
        Visible to members of <Text className="font-semibold">{teamName}</Text> and your Church Admins.
      </Text>
    </View>
  );
}

export function TeamPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { s } = useStore();
  return (
    <View className="flex-row flex-wrap gap-2">
      {s.teams.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => onChange(t.id)}
          className={`rounded-full border px-3 py-1 ${value === t.id ? 'border-indigo-600 bg-indigo-600' : 'border-stone-300'}`}>
          <Text className={value === t.id ? 'text-white' : 'text-stone-700'}>{t.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}
