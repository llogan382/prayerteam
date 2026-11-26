// PROTOTYPE — throwaway. Variant B: "Prayer time".
// Home is a one-at-a-time deck of requests you haven't prayed for yet; the full list is secondary.
// Compose is an inline card that expands at the top. Detail splits Updates and Comments into tabs.
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ActionMenu, Bell, NotificationsPanel, RefreshableScroll, TeamPicker, useRequestActions, VisibilityNotice } from './platform';
import { filterRefuses, prayedLine, timeAgo, useStore, type Status } from './store';

type Screen = { k: 'home' } | { k: 'detail'; id: string } | { k: 'notices' };

export function VariantB() {
  const [screen, setScreen] = useState<Screen>({ k: 'home' });
  if (screen.k === 'detail') return <Detail id={screen.id} back={() => setScreen({ k: 'home' })} />;
  if (screen.k === 'notices')
    return <NotificationsPanel onClose={() => setScreen({ k: 'home' })} onOpen={(id) => setScreen({ k: 'detail', id })} />;
  return <Home open={(id) => setScreen({ k: 'detail', id })} bell={() => setScreen({ k: 'notices' })} />;
}

function Home({ open, bell }: { open: (id: string) => void; bell: () => void }) {
  const { s, d, team, byStatus, name, isMine, prayed } = useStore();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [filter, setFilter] = useState<Status>('active');
  const deck = byStatus('active').filter((r) => !isMine(r) && !prayed(r) && !skipped.includes(r.id));
  const card = deck[0];
  return (
    <View className="flex-1 bg-indigo-950">
      <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
        <View className="flex-row flex-wrap gap-2">
          {s.teams.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                d({ t: 'team', teamId: t.id });
                setSkipped([]);
              }}
              className={`rounded-full px-3 py-1 ${t.id === team.id ? 'bg-white' : 'bg-indigo-900'}`}>
              <Text className={t.id === team.id ? 'font-semibold text-indigo-950' : 'text-indigo-200'}>{t.name}</Text>
            </Pressable>
          ))}
        </View>
        <Bell onPress={bell} dark />
      </View>

      <RefreshableScroll className="flex-1">
        <InlineCompose />

        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-widest text-indigo-300">
          Pray now · {deck.length} left
        </Text>
        {card ? (
          <View className="mx-5 rounded-3xl bg-white p-6">
            <Text className="text-xs text-stone-400">
              {name(card.authorId)} · {timeAgo(card.createdAt)}
            </Text>
            <Text className="mt-2 text-2xl font-bold text-stone-900">{card.title}</Text>
            <Text className="mt-3 text-base leading-6 text-stone-700">{card.body}</Text>
            <Text className="mt-4 text-sm text-stone-400">{prayedLine(card.prayedBy.map(name))}</Text>
            <Pressable onPress={() => d({ t: 'pray', id: card.id })} className="mt-6 items-center rounded-2xl bg-indigo-600 py-4">
              <Text className="text-lg font-bold text-white">🙏 I prayed</Text>
            </Pressable>
            <View className="mt-3 flex-row justify-between">
              <Pressable onPress={() => setSkipped([...skipped, card.id])} className="px-2 py-2">
                <Text className="text-stone-500">Skip for now</Text>
              </Pressable>
              <Pressable onPress={() => open(card.id)} className="px-2 py-2">
                <Text className="text-indigo-600">Open thread ›</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="mx-5 items-center rounded-3xl bg-indigo-900 p-8">
            <Text className="text-3xl">🕊</Text>
            <Text className="mt-2 text-center text-indigo-100">You’ve prayed for every request in {team.name}.</Text>
            {skipped.length ? (
              <Pressable onPress={() => setSkipped([])} className="mt-3">
                <Text className="text-indigo-300 underline">Show {skipped.length} skipped</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View className="mt-8 flex-row items-baseline gap-4 px-5">
          <Text className="text-xs font-semibold uppercase tracking-widest text-indigo-300">All requests</Text>
          {(['active', 'answered', 'archived'] as const).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)}>
              <Text className={filter === f ? 'text-white underline' : 'text-indigo-400'}>
                {f[0].toUpperCase() + f.slice(1)} {byStatus(f).length}
              </Text>
            </Pressable>
          ))}
        </View>
        {byStatus(filter).map((r) => (
          <Pressable key={r.id} onPress={() => open(r.id)} className="flex-row items-center gap-3 border-b border-indigo-900 px-5 py-3">
            <Text className="w-6 text-center">{prayed(r) ? '✓' : isMine(r) ? '✎' : '•'}</Text>
            <View className="flex-1">
              <Text className="text-white">{r.title}</Text>
              <Text className="text-xs text-indigo-300">
                {name(r.authorId)} · 🙏 {r.prayedBy.length} · {r.entries.filter((e) => e.kind === 'update').length} Updates
              </Text>
            </View>
            <Text className="text-indigo-400">›</Text>
          </Pressable>
        ))}
      </RefreshableScroll>
    </View>
  );
}

function InlineCompose() {
  const { s, d, team } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [teamId, setTeamId] = useState(s.teamId);
  const [refused, setRefused] = useState(false);
  if (!open)
    return (
      <Pressable onPress={() => setOpen(true)} className="mx-5 mt-2 rounded-2xl bg-indigo-900 px-4 py-4">
        <Text className="text-indigo-200">✎ Share a Prayer Request with {team.name}…</Text>
      </Pressable>
    );
  const target = s.teams.find((t) => t.id === teamId)!;
  return (
    <View className="mx-5 mt-2 gap-3 rounded-2xl bg-white p-4">
      <TeamPicker value={teamId} onChange={setTeamId} />
      <VisibilityNotice teamName={target.name} />
      <TextInput autoFocus value={title} onChangeText={setTitle} placeholder="What can we pray for?" className="text-lg font-semibold" />
      <TextInput value={body} onChangeText={setBody} placeholder="Details (optional)" multiline className="min-h-[80px]" style={{ textAlignVertical: 'top' }} />
      {refused ? <Text className="text-red-600">Some wording can’t be posted. Please rephrase.</Text> : null}
      <View className="flex-row justify-end gap-3">
        <Pressable onPress={() => setOpen(false)} className="px-3 py-2">
          <Text className="text-stone-500">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!title.trim()) return;
            if (filterRefuses(title + ' ' + body)) return setRefused(true);
            d({ t: 'create', teamId, title: title.trim(), body: body.trim() });
            d({ t: 'team', teamId });
            setOpen(false);
            setTitle('');
            setBody('');
            setRefused(false);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2">
          <Text className="font-semibold text-white">Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Detail({ id, back }: { id: string; back: () => void }) {
  const { get, d, name, isMine, prayed, status, entriesFor, archivesIn } = useStore();
  const actions = useRequestActions(id, back);
  const r = get(id);
  const [tab, setTab] = useState<'update' | 'comment'>('update');
  const [text, setText] = useState('');
  const [refused, setRefused] = useState(false);
  if (!r) return null;
  const mine = isMine(r);
  const st = status(r);
  const entries = entriesFor(r).filter((e) => e.kind === tab);
  const canWrite = st !== 'archived' && (tab === 'comment' || mine);
  return (
    <View className="flex-1 bg-white">
      <View className="bg-indigo-950 px-5 pb-6 pt-3">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={back}>
            <Text className="text-indigo-200">‹ Back</Text>
          </Pressable>
          <ActionMenu items={actions} dark />
        </View>
        <Text className="mt-3 text-xs text-indigo-300">
          {name(r.authorId)} · {timeAgo(r.createdAt)} ·{' '}
          {st === 'answered' ? `🎉 Answered, archives in ${archivesIn(r)}d` : st === 'archived' ? '🗄 Archived' : `archives in ${archivesIn(r)}d`}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-white">{r.title}</Text>
        <Text className="mt-2 text-indigo-100">{r.body}</Text>
        <View className="mt-4 flex-row items-center justify-between">
          <Text className="flex-1 text-sm text-indigo-300">{prayedLine(r.prayedBy.map(name))}</Text>
          {!mine && st !== 'archived' ? (
            <Pressable onPress={() => d({ t: 'pray', id })} className={`rounded-full px-4 py-2 ${prayed(r) ? 'bg-indigo-800' : 'bg-white'}`}>
              <Text className={prayed(r) ? 'text-indigo-100' : 'font-semibold text-indigo-950'}>{prayed(r) ? '✓ Prayed' : '🙏 I prayed'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View className="flex-row border-b border-stone-200">
        {(['update', 'comment'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} className={`flex-1 items-center py-3 ${tab === t ? 'border-b-2 border-indigo-600' : ''}`}>
            <Text className={tab === t ? 'font-semibold text-indigo-700' : 'text-stone-500'}>
              {t === 'update' ? 'Updates' : 'Comments'} ({entriesFor(r).filter((e) => e.kind === t).length})
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {entries.length === 0 ? (
          <Text className="py-6 text-center text-stone-400">
            {tab === 'update' ? (mine ? 'Let your Team know how things are going.' : `No Updates from ${name(r.authorId)} yet.`) : 'No Comments yet.'}
          </Text>
        ) : null}
        {entries.map((e) => (
          <View key={e.id} className="mb-4">
            <Text className="text-xs text-stone-400">
              {name(e.authorId)} · {timeAgo(e.at)}
            </Text>
            <Text className={tab === 'update' ? 'mt-1 text-base text-stone-900' : 'mt-1 text-stone-800'}>{e.text}</Text>
          </View>
        ))}
      </ScrollView>
      {canWrite ? (
        <View className="border-t border-stone-200 px-3 pb-16 pt-2">
          {refused ? <Text className="mb-1 text-sm text-red-600">That wording can’t be posted. Please rephrase.</Text> : null}
          <View className="flex-row gap-2">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={tab === 'update' ? 'Post an Update…' : 'Write a Comment…'}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
            />
            <Pressable
              onPress={() => {
                if (!text.trim()) return;
                if (filterRefuses(text)) return setRefused(true);
                d({ t: 'entry', id, kind: tab, text: text.trim() });
                setText('');
                setRefused(false);
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2">
              <Text className="font-semibold text-white">Post</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
