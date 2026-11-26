// PROTOTYPE — throwaway. Variant C: "Conversation".
// Teams are channels; requests are threads. Wide screens (web/tablet) get a three-pane split; phones stack.
// One scrolling list grouped by status (Answered/Archived collapsed). Detail reads like a chat:
// Updates as a pinned timeline strip, Comments as bubbles, Prayed Marks as a reaction chip.
// Compose is a bottom sheet.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ActionMenu, Bell, NotificationsPanel, RefreshableScroll, TeamPicker, useRequestActions, VisibilityNotice } from './platform';
import { filterRefuses, prayedLine, timeAgo, useStore, type PrayerRequest } from './store';

export function VariantC() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [sel, setSel] = useState<string | null>(null);
  const [notices, setNotices] = useState(false);
  const [composing, setComposing] = useState(false);

  const body = notices ? (
    <NotificationsPanel
      onClose={() => setNotices(false)}
      onOpen={(id) => {
        setNotices(false);
        setSel(id);
      }}
    />
  ) : wide ? (
    <View className="flex-1 flex-row">
      <Channels />
      <View className="w-[360px] border-r border-stone-200">
        <List sel={sel} open={setSel} compose={() => setComposing(true)} bell={() => setNotices(true)} />
      </View>
      <View className="flex-1">{sel ? <Thread id={sel} back={() => setSel(null)} /> : <Empty />}</View>
    </View>
  ) : sel ? (
    <Thread id={sel} back={() => setSel(null)} />
  ) : (
    <List sel={sel} open={setSel} compose={() => setComposing(true)} bell={() => setNotices(true)} showChannels />
  );

  return (
    <View className="flex-1 bg-white">
      {body}
      <ComposeSheet visible={composing} close={() => setComposing(false)} />
    </View>
  );
}

function Empty() {
  return (
    <View className="flex-1 items-center justify-center bg-stone-50">
      <Text className="text-stone-400">Select a Prayer Request</Text>
    </View>
  );
}

function Channels() {
  const { s, d, team } = useStore();
  return (
    <View className="w-[200px] bg-stone-900 px-3 pt-4">
      <Text className="mb-3 px-2 text-xs font-semibold uppercase text-stone-400">{s.churchName}</Text>
      {s.teams.map((t) => (
        <Pressable key={t.id} onPress={() => d({ t: 'team', teamId: t.id })} className={`mb-1 rounded-md px-2 py-2 ${t.id === team.id ? 'bg-stone-700' : ''}`}>
          <Text className={t.id === team.id ? 'font-semibold text-white' : 'text-stone-300'}>
            # {t.name}
            {t.muted ? ' 🔕' : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function List({ sel, open, compose, bell, showChannels }: { sel: string | null; open: (id: string) => void; compose: () => void; bell: () => void; showChannels?: boolean }) {
  const { s, d, team, byStatus } = useStore();
  const [showAnswered, setShowAnswered] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center justify-between border-b border-stone-200 px-4 py-3">
        <Text className="text-lg font-bold"># {team.name}</Text>
        <View className="flex-row items-center gap-1">
          <Bell onPress={bell} />
          <Pressable onPress={compose} className="rounded-md bg-emerald-600 px-3 py-1.5">
            <Text className="font-semibold text-white">New</Text>
          </Pressable>
        </View>
      </View>
      {showChannels ? (
        <ScrollView horizontal className="max-h-12 border-b border-stone-100 px-2" showsHorizontalScrollIndicator={false}>
          {s.teams.map((t) => (
            <Pressable key={t.id} onPress={() => d({ t: 'team', teamId: t.id })} className="mx-1 justify-center px-2">
              <Text className={t.id === team.id ? 'font-semibold text-emerald-700' : 'text-stone-500'}># {t.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <RefreshableScroll className="flex-1">
        {byStatus('active').map((r) => (
          <Row key={r.id} r={r} sel={sel === r.id} open={open} />
        ))}
        <Section label="Answered" count={byStatus('answered').length} open={showAnswered} toggle={() => setShowAnswered(!showAnswered)} />
        {showAnswered ? byStatus('answered').map((r) => <Row key={r.id} r={r} sel={sel === r.id} open={open} />) : null}
        <Section label="Archived" count={byStatus('archived').length} open={showArchived} toggle={() => setShowArchived(!showArchived)} />
        {showArchived ? byStatus('archived').map((r) => <Row key={r.id} r={r} sel={sel === r.id} open={open} />) : null}
      </RefreshableScroll>
    </View>
  );
}

function Section({ label, count, open, toggle }: { label: string; count: number; open: boolean; toggle: () => void }) {
  return (
    <Pressable onPress={toggle} className="flex-row items-center gap-2 bg-stone-50 px-4 py-2">
      <Text className="text-stone-500">{open ? '▾' : '▸'}</Text>
      <Text className="text-xs font-semibold uppercase text-stone-500">
        {label} ({count})
      </Text>
    </Pressable>
  );
}

function Row({ r, sel, open }: { r: PrayerRequest; sel: boolean; open: (id: string) => void }) {
  const { name, entriesFor, prayed, status } = useStore();
  const last = entriesFor(r).at(-1);
  const st = status(r);
  return (
    <Pressable onPress={() => open(r.id)} className={`flex-row gap-3 border-b border-stone-100 px-4 py-3 ${sel ? 'bg-emerald-50' : ''}`}>
      <View className="h-10 w-10 items-center justify-center rounded-full bg-stone-200">
        <Text>{name(r.authorId)[0]}</Text>
      </View>
      <View className="flex-1">
        <View className="flex-row justify-between">
          <Text className="font-semibold text-stone-900" numberOfLines={1}>
            {st === 'answered' ? '🎉 ' : ''}
            {r.title}
          </Text>
          <Text className="text-xs text-stone-400">{timeAgo(last?.at ?? r.createdAt)}</Text>
        </View>
        <Text className="text-sm text-stone-500" numberOfLines={1}>
          {last ? `${name(last.authorId)}: ${last.kind === 'update' ? '📌 ' : ''}${last.text}` : r.body}
        </Text>
        <Text className={`mt-0.5 text-xs ${prayed(r) ? 'text-emerald-700' : 'text-stone-400'}`}>🙏 {r.prayedBy.length}</Text>
      </View>
    </Pressable>
  );
}

function Thread({ id, back }: { id: string; back: () => void }) {
  const { get, d, name, isMine, prayed, status, entriesFor, archivesIn, s } = useStore();
  const actions = useRequestActions(id, back);
  const [text, setText] = useState('');
  const [asUpdate, setAsUpdate] = useState(false);
  const [refused, setRefused] = useState(false);
  const [showPrayers, setShowPrayers] = useState(false);
  const r = get(id);
  if (!r) return <Empty />;
  const mine = isMine(r);
  const st = status(r);
  const updates = entriesFor(r).filter((e) => e.kind === 'update');
  const comments = entriesFor(r).filter((e) => e.kind === 'comment');
  return (
    <View className="flex-1 bg-stone-50">
      <View className="flex-row items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Pressable onPress={back}>
          <Text className="text-emerald-700">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="font-semibold" numberOfLines={1}>
            {r.title}
          </Text>
          <Text className="text-xs text-stone-400">
            {name(r.authorId)} · {st === 'answered' ? `Answered · archives in ${archivesIn(r)}d` : st === 'archived' ? 'Archived' : `archives in ${archivesIn(r)}d`}
            {r.following && !mine ? ' · Following' : ''}
          </Text>
        </View>
        <ActionMenu items={actions} />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <View className="rounded-2xl bg-white p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <Text className="text-base text-stone-800">{r.body}</Text>
          <View className="mt-3 flex-row items-center gap-2">
            <Pressable
              disabled={mine || st === 'archived'}
              onPress={() => d({ t: 'pray', id })}
              className={`rounded-full border px-3 py-1 ${prayed(r) ? 'border-emerald-600 bg-emerald-50' : 'border-stone-300'}`}>
              <Text className={prayed(r) ? 'text-emerald-700' : 'text-stone-600'}>🙏 {r.prayedBy.length}</Text>
            </Pressable>
            <Pressable onPress={() => setShowPrayers(!showPrayers)}>
              <Text className="text-xs text-stone-400">{mine ? prayedLine(r.prayedBy.map(name)) : prayed(r) ? 'You prayed' : 'Tap 🙏 when you’ve prayed'}</Text>
            </Pressable>
          </View>
          {showPrayers && !mine ? <Text className="mt-2 text-xs text-stone-500">{prayedLine(r.prayedBy.map(name))}</Text> : null}
        </View>

        {updates.length ? (
          <View className="mt-4">
            <Text className="mb-2 text-xs font-semibold uppercase text-stone-400">📌 Updates</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {updates.map((u) => (
                <View key={u.id} className="mr-3 w-64 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <Text className="text-xs text-amber-700">{timeAgo(u.at)} ago</Text>
                  <Text className="mt-1 text-stone-800">{u.text}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View className="mt-4 gap-2">
          {comments.map((c) => {
            const me = c.authorId === s.viewerId;
            return (
              <View key={c.id} className={`max-w-[80%] ${me ? 'self-end' : 'self-start'}`}>
                {!me ? <Text className="mb-0.5 ml-2 text-xs text-stone-400">{name(c.authorId)}</Text> : null}
                <View className={`rounded-2xl px-3 py-2 ${me ? 'bg-emerald-600' : 'bg-white'}`}>
                  <Text className={me ? 'text-white' : 'text-stone-800'}>{c.text}</Text>
                </View>
                <Text className={`mt-0.5 text-[10px] text-stone-400 ${me ? 'text-right' : 'ml-2'}`}>{timeAgo(c.at)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {st !== 'archived' ? (
        <View className="border-t border-stone-200 bg-white px-3 pb-16 pt-2">
          {refused ? <Text className="mb-1 text-sm text-red-600">That wording can’t be posted. Please rephrase.</Text> : null}
          <View className="flex-row items-center gap-2">
            {mine ? (
              <Pressable onPress={() => setAsUpdate(!asUpdate)} className={`rounded-full px-2 py-2 ${asUpdate ? 'bg-amber-100' : 'bg-stone-100'}`} accessibilityLabel="Toggle Update">
                <Text>{asUpdate ? '📌' : '💬'}</Text>
              </Pressable>
            ) : null}
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={mine && asUpdate ? 'Pin an Update for the Team…' : 'Message'}
              className="flex-1 rounded-full bg-stone-100 px-4 py-2"
            />
            <Pressable
              onPress={() => {
                if (!text.trim()) return;
                if (filterRefuses(text)) return setRefused(true);
                d({ t: 'entry', id, kind: mine && asUpdate ? 'update' : 'comment', text: text.trim() });
                setText('');
                setRefused(false);
              }}
              className="h-9 w-9 items-center justify-center rounded-full bg-emerald-600">
              <Text className="font-bold text-white">↑</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text className="pb-16 pt-3 text-center text-sm text-stone-400">Archived · read-only</Text>
      )}
    </View>
  );
}

function ComposeSheet({ visible, close }: { visible: boolean; close: () => void }) {
  const { s, d } = useStore();
  const [teamId, setTeamId] = useState(s.teamId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [refused, setRefused] = useState(false);
  const target = s.teams.find((t) => t.id === teamId)!;
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
      <Pressable onPress={close} className="flex-1 bg-black/30" />
      <View className="mx-auto w-full max-w-xl gap-3 rounded-t-3xl bg-white p-5 pb-10">
        <View className="mb-1 h-1 w-10 self-center rounded-full bg-stone-300" />
        <Text className="text-xs font-semibold uppercase text-stone-400">Post to</Text>
        <TeamPicker value={teamId} onChange={setTeamId} />
        <TextInput value={title} onChangeText={setTitle} placeholder="What can we pray for?" className="text-lg font-semibold" />
        <TextInput value={body} onChangeText={setBody} placeholder="Details (optional)" multiline className="min-h-[90px]" style={{ textAlignVertical: 'top' }} />
        <VisibilityNotice teamName={target.name} />
        {refused ? <Text className="text-red-600">Some wording can’t be posted. Please rephrase.</Text> : null}
        <Pressable
          onPress={() => {
            if (!title.trim()) return;
            if (filterRefuses(title + ' ' + body)) return setRefused(true);
            d({ t: 'create', teamId, title: title.trim(), body: body.trim() });
            d({ t: 'team', teamId });
            setTitle('');
            setBody('');
            setRefused(false);
            close();
          }}
          className={`items-center rounded-xl py-3 ${title.trim() ? 'bg-emerald-600' : 'bg-stone-200'}`}>
          <Text className="font-semibold text-white">Post to {target.name}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
