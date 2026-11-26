// PROTOTYPE — throwaway. Variant A: "Classic list".
// Segmented Active / Answered / Archived tabs; full-screen detail with one chronological thread
// (Updates highlighted inline); full-screen compose form behind a floating + button.
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ActionMenu, Bell, NotificationsPanel, RefreshableScroll, TeamPicker, useRequestActions, VisibilityNotice } from './platform';
import { filterRefuses, prayedLine, timeAgo, useStore, type Status } from './store';

type Screen = { k: 'feed' } | { k: 'detail'; id: string } | { k: 'compose' } | { k: 'notices' };

export function VariantA() {
  const [screen, setScreen] = useState<Screen>({ k: 'feed' });
  if (screen.k === 'detail') return <Detail id={screen.id} back={() => setScreen({ k: 'feed' })} />;
  if (screen.k === 'compose') return <Compose done={() => setScreen({ k: 'feed' })} />;
  if (screen.k === 'notices')
    return <NotificationsPanel onClose={() => setScreen({ k: 'feed' })} onOpen={(id) => setScreen({ k: 'detail', id })} />;
  return <Feed open={(id) => setScreen({ k: 'detail', id })} compose={() => setScreen({ k: 'compose' })} bell={() => setScreen({ k: 'notices' })} />;
}

function Feed({ open, compose, bell }: { open: (id: string) => void; compose: () => void; bell: () => void }) {
  const { s, d, team, byStatus, name, prayed, archivesIn } = useStore();
  const [tab, setTab] = useState<Status>('active');
  const list = byStatus(tab);
  return (
    <View className="flex-1 bg-stone-50">
      <View className="border-b border-stone-200 bg-white px-4 pb-2 pt-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs text-stone-400">{s.churchName}</Text>
            <Text className="text-xl font-bold text-stone-900">{team.name}</Text>
          </View>
          <Bell onPress={bell} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
          {s.teams.map((t) => (
            <Pressable key={t.id} onPress={() => d({ t: 'team', teamId: t.id })} className="mr-4 py-1">
              <Text className={t.id === team.id ? 'font-semibold text-indigo-600' : 'text-stone-500'}>
                {t.name}
                {t.muted ? ' 🔕' : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View className="mt-2 flex-row rounded-lg bg-stone-100 p-1">
          {(['active', 'answered', 'archived'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} className={`flex-1 items-center rounded-md py-1.5 ${tab === t ? 'bg-white' : ''}`}>
              <Text className={tab === t ? 'font-semibold text-stone-900' : 'text-stone-500'}>
                {t === 'active' ? 'Active' : t === 'answered' ? 'Answered' : 'Archived'} ({byStatus(t).length})
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <RefreshableScroll className="flex-1">
        {list.length === 0 ? <Text className="p-8 text-center text-stone-400">Nothing here yet.</Text> : null}
        {list.map((r) => {
          const lastUpdate = [...r.entries].reverse().find((e) => e.kind === 'update');
          return (
            <Pressable key={r.id} onPress={() => open(r.id)} className="mx-3 mt-3 rounded-xl border border-stone-200 bg-white p-4 active:bg-stone-50">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-stone-400">
                  {name(r.authorId)} · {timeAgo(r.createdAt)}
                </Text>
                {tab === 'answered' ? <Text className="text-xs text-emerald-700">🎉 Answered · archives in {archivesIn(r)}d</Text> : null}
              </View>
              <Text className="mt-1 text-base font-semibold text-stone-900">{r.title}</Text>
              <Text numberOfLines={2} className="mt-1 text-stone-600">
                {r.body}
              </Text>
              {lastUpdate ? (
                <View className="mt-2 rounded-md border-l-4 border-indigo-400 bg-indigo-50 px-2 py-1">
                  <Text numberOfLines={1} className="text-sm text-indigo-900">
                    Update: {lastUpdate.text}
                  </Text>
                </View>
              ) : null}
              <View className="mt-3 flex-row gap-4">
                <Text className={`text-sm ${prayed(r) ? 'font-semibold text-indigo-600' : 'text-stone-500'}`}>🙏 {r.prayedBy.length}</Text>
                <Text className="text-sm text-stone-500">💬 {r.entries.filter((e) => e.kind === 'comment').length}</Text>
              </View>
            </Pressable>
          );
        })}
      </RefreshableScroll>
      <Pressable onPress={compose} className="absolute bottom-20 right-5 h-14 w-14 items-center justify-center rounded-full bg-indigo-600 shadow-lg">
        <Text className="text-3xl text-white">+</Text>
      </Pressable>
    </View>
  );
}

function Detail({ id, back }: { id: string; back: () => void }) {
  const { get, d, name, isMine, prayed, status, entriesFor, archivesIn } = useStore();
  const actions = useRequestActions(id, back);
  const [text, setText] = useState('');
  const [asUpdate, setAsUpdate] = useState(false);
  const [refused, setRefused] = useState(false);
  const r = get(id);
  if (!r) return null;
  const mine = isMine(r);
  const st = status(r);
  const prayers = r.prayedBy.map((m) => name(m));
  const send = () => {
    if (!text.trim()) return;
    if (filterRefuses(text)) return setRefused(true);
    d({ t: 'entry', id, kind: mine && asUpdate ? 'update' : 'comment', text: text.trim() });
    setText('');
    setRefused(false);
  };
  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center justify-between border-b border-stone-200 px-4 py-3">
        <Pressable onPress={back}>
          <Text className="text-indigo-600">‹ Back</Text>
        </Pressable>
        <ActionMenu items={actions} />
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {st !== 'active' ? (
          <Text className={`mb-2 text-sm ${st === 'answered' ? 'text-emerald-700' : 'text-stone-500'}`}>
            {st === 'answered' ? `🎉 Answered · archives in ${archivesIn(r)} days` : '🗄 Archived'}
          </Text>
        ) : (
          <Text className="mb-2 text-xs text-stone-400">Archives in {archivesIn(r)} days</Text>
        )}
        <Text className="text-xs text-stone-400">
          {name(r.authorId)} · {timeAgo(r.createdAt)} {r.following && !mine ? '· Following' : ''}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-stone-900">{r.title}</Text>
        <Text className="mt-2 text-base leading-6 text-stone-700">{r.body}</Text>

        <View className="mt-5 rounded-xl bg-stone-50 p-4">
          {mine ? (
            <Text className="text-stone-700">🙏 {prayedLine(prayers)}</Text>
          ) : (
            <Pressable
              onPress={() => d({ t: 'pray', id })}
              disabled={st === 'archived'}
              className={`items-center rounded-lg py-3 ${prayed(r) ? 'bg-indigo-100' : 'bg-indigo-600'}`}>
              <Text className={`text-base font-semibold ${prayed(r) ? 'text-indigo-700' : 'text-white'}`}>
                {prayed(r) ? '✓ You prayed' : '🙏 I prayed'}
              </Text>
            </Pressable>
          )}
          {!mine ? <Text className="mt-2 text-center text-sm text-stone-500">{prayedLine(prayers)}</Text> : null}
        </View>

        <Text className="mb-2 mt-6 text-xs font-semibold uppercase text-stone-400">Thread</Text>
        {entriesFor(r).map((e) =>
          e.kind === 'update' ? (
            <View key={e.id} className="mb-3 rounded-lg border-l-4 border-indigo-500 bg-indigo-50 p-3">
              <Text className="text-xs font-semibold text-indigo-700">
                UPDATE from {name(e.authorId)} · {timeAgo(e.at)}
              </Text>
              <Text className="mt-1 text-stone-800">{e.text}</Text>
            </View>
          ) : (
            <View key={e.id} className="mb-3 flex-row gap-2 px-1">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-stone-200">
                <Text className="text-xs">{name(e.authorId)[0]}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xs text-stone-400">
                  {name(e.authorId)} · {timeAgo(e.at)}
                </Text>
                <Text className="text-stone-800">{e.text}</Text>
              </View>
            </View>
          ),
        )}
      </ScrollView>
      {st !== 'archived' ? (
        <View className="border-t border-stone-200 bg-white px-3 pb-16 pt-2">
          {refused ? <Text className="mb-1 text-sm text-red-600">That wording can’t be posted. Please rephrase.</Text> : null}
          {mine ? (
            <View className="mb-2 flex-row gap-2">
              {[false, true].map((u) => (
                <Pressable key={String(u)} onPress={() => setAsUpdate(u)} className={`rounded-full px-3 py-1 ${asUpdate === u ? 'bg-stone-800' : 'bg-stone-100'}`}>
                  <Text className={asUpdate === u ? 'text-white' : 'text-stone-600'}>{u ? 'Post an Update' : 'Comment'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View className="flex-row items-center gap-2">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={mine && asUpdate ? 'Share how things are going…' : 'Write a Comment…'}
              className="flex-1 rounded-full border border-stone-300 px-4 py-2"
            />
            <Pressable onPress={send} className="rounded-full bg-indigo-600 px-4 py-2">
              <Text className="font-semibold text-white">Send</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text className="pb-16 text-center text-sm text-stone-400">Archived requests are read-only. Un-archive to continue.</Text>
      )}
    </View>
  );
}

function Compose({ done }: { done: () => void }) {
  const { s, d } = useStore();
  const [teamId, setTeamId] = useState(s.teamId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [refused, setRefused] = useState(false);
  const team = s.teams.find((t) => t.id === teamId)!;
  const post = () => {
    if (!title.trim()) return;
    if (filterRefuses(title + ' ' + body)) return setRefused(true);
    d({ t: 'create', teamId, title: title.trim(), body: body.trim() });
    d({ t: 'team', teamId });
    done();
  };
  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center justify-between border-b border-stone-200 px-4 py-3">
        <Pressable onPress={done}>
          <Text className="text-stone-500">Cancel</Text>
        </Pressable>
        <Text className="font-semibold">New Prayer Request</Text>
        <Pressable onPress={post}>
          <Text className={`font-semibold ${title.trim() ? 'text-indigo-600' : 'text-stone-300'}`}>Post</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View>
          <Text className="mb-2 text-xs font-semibold uppercase text-stone-400">Team</Text>
          <TeamPicker value={teamId} onChange={setTeamId} />
        </View>
        <VisibilityNotice teamName={team.name} />
        <TextInput value={title} onChangeText={setTitle} placeholder="What can we pray for?" className="border-b border-stone-200 py-2 text-lg font-semibold" />
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Add details (optional)"
          multiline
          className="min-h-[140px] rounded-lg border border-stone-200 p-3"
          style={{ textAlignVertical: 'top' }}
        />
        {refused ? <Text className="text-red-600">Some wording can’t be posted. Please rephrase and try again.</Text> : null}
        <Text className="text-xs text-stone-400">Archives automatically after {s.archiveDays} days. You can mark it Answered any time.</Text>
      </ScrollView>
    </View>
  );
}
