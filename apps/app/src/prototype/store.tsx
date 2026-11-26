// PROTOTYPE — throwaway. In-memory store for the core-screens prototype. Nothing persists; reload resets.
import { createContext, useContext, useReducer, type ReactNode } from 'react';

export type EntryKind = 'update' | 'comment';
export type Entry = { id: string; kind: EntryKind; authorId: string; text: string; at: number };
export type PrayerRequest = {
  id: string;
  teamId: string;
  authorId: string | null; // null = "Former member"
  title: string;
  body: string;
  createdAt: number;
  answeredAt?: number;
  archivedAt?: number;
  prayedBy: string[];
  entries: Entry[];
  following: boolean;
  reportedByViewer?: boolean;
};
export type Member = { id: string; name: string };
export type Team = { id: string; name: string; muted: boolean };
export type Notice = { id: string; text: string; at: number; read: boolean; requestId?: string };
export type Status = 'active' | 'answered' | 'archived';

export type State = {
  viewerId: string;
  churchName: string;
  archiveDays: number;
  teamId: string;
  teams: Team[];
  members: Member[];
  requests: PrayerRequest[];
  notices: Notice[];
  blocked: string[];
  push: { prayed: boolean; activity: boolean; newRequests: boolean };
};

const H = 3600_000;
const now = Date.now();
const ago = (h: number) => now - h * H;

const initial: State = {
  viewerId: 'me',
  churchName: 'Grace Fellowship',
  archiveDays: 30,
  teamId: 't1',
  teams: [
    { id: 't1', name: 'Everyone', muted: false },
    { id: 't2', name: 'Tuesday Small Group', muted: false },
    { id: 't3', name: "Women's Ministry", muted: true },
  ],
  members: [
    { id: 'me', name: 'Sam Rivera' },
    { id: 'm2', name: 'Ann Lee' },
    { id: 'm3', name: 'Ben Okafor' },
    { id: 'm4', name: 'Carla Diaz' },
    { id: 'm5', name: 'Dev Patel' },
    { id: 'm6', name: 'Esther Kim' },
  ],
  requests: [
    {
      id: 'r1', teamId: 't1', authorId: 'm2', title: "My mom's surgery on Friday",
      body: 'She is having a hip replacement. Please pray for the surgeons, and for peace for her — she is very anxious.',
      createdAt: ago(30), prayedBy: ['m3', 'm4', 'm5', 'm6'], following: true,
      entries: [
        { id: 'e1', kind: 'comment', authorId: 'm3', text: 'Praying for her and for you, Ann.', at: ago(28) },
        { id: 'e2', kind: 'update', authorId: 'm2', text: 'Surgery moved to Thursday morning, 8am.', at: ago(10) },
        { id: 'e3', kind: 'comment', authorId: 'm4', text: 'I can bring a meal over the weekend if that helps.', at: ago(9) },
      ],
    },
    {
      id: 'r2', teamId: 't1', authorId: 'me', title: 'Job interview next week',
      body: 'Second round for a role I really want. Pray for clarity and calm.',
      createdAt: ago(50), prayedBy: ['m2', 'm6'], following: true,
      entries: [{ id: 'e4', kind: 'comment', authorId: 'm6', text: 'You’ve got this. Praying!', at: ago(40) }],
    },
    {
      id: 'r3', teamId: 't1', authorId: 'm5', title: 'Travel safety for our mission team',
      body: 'Eight of us fly to Guatemala on Sunday for ten days.',
      createdAt: ago(4), prayedBy: [], following: false, entries: [],
    },
    {
      id: 'r4', teamId: 't1', authorId: 'm6', title: 'Healing for my back',
      body: 'Three weeks of pain. Seeing a specialist soon.',
      createdAt: ago(24 * 9), answeredAt: ago(20), prayedBy: ['me', 'm2', 'm3', 'm4', 'm5'], following: true,
      entries: [
        { id: 'e5', kind: 'update', authorId: 'm6', text: 'Specialist found the cause — physio is working. Thank you all!', at: ago(20) },
      ],
    },
    {
      id: 'r5', teamId: 't1', authorId: null, title: 'Wisdom for a family decision',
      body: 'We are deciding whether to move closer to my parents.',
      createdAt: ago(24 * 45), archivedAt: ago(24 * 15), prayedBy: ['me', 'm3'], following: false, entries: [],
    },
    {
      id: 'r6', teamId: 't2', authorId: 'm3', title: 'Our small group leader search',
      body: 'Pray we find someone to lead in the new year.',
      createdAt: ago(70), prayedBy: ['m2'], following: false, entries: [],
    },
  ],
  notices: [
    { id: 'n1', text: 'Ann Lee posted an Update in Everyone', at: ago(10), read: false, requestId: 'r1' },
    { id: 'n2', text: 'Esther Kim and 1 other prayed for your request in Everyone', at: ago(30), read: false, requestId: 'r2' },
    { id: 'n3', text: 'Esther Kim marked a request Answered in Everyone', at: ago(20), read: true, requestId: 'r4' },
  ],
  blocked: [],
  push: { prayed: true, activity: true, newRequests: false },
};

type Action =
  | { t: 'pray'; id: string }
  | { t: 'entry'; id: string; kind: EntryKind; text: string }
  | { t: 'answered'; id: string; on: boolean }
  | { t: 'archived'; id: string; on: boolean }
  | { t: 'create'; teamId: string; title: string; body: string }
  | { t: 'delete'; id: string }
  | { t: 'report'; id: string }
  | { t: 'block'; memberId: string }
  | { t: 'follow'; id: string }
  | { t: 'mute'; teamId: string }
  | { t: 'push'; key: keyof State['push'] }
  | { t: 'readAll' }
  | { t: 'team'; teamId: string };

let seq = 100;
const uid = () => `x${seq++}`;
const patch = (s: State, id: string, f: (r: PrayerRequest) => PrayerRequest): State => ({
  ...s,
  requests: s.requests.map((r) => (r.id === id ? f(r) : r)),
});

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'pray':
      return patch(s, a.id, (r) => ({
        ...r,
        following: true,
        prayedBy: r.prayedBy.includes(s.viewerId) ? r.prayedBy.filter((m) => m !== s.viewerId) : [...r.prayedBy, s.viewerId],
      }));
    case 'entry':
      return patch(s, a.id, (r) => ({
        ...r,
        following: true,
        entries: [...r.entries, { id: uid(), kind: a.kind, authorId: s.viewerId, text: a.text, at: Date.now() }],
      }));
    case 'answered':
      return patch(s, a.id, (r) => ({ ...r, answeredAt: a.on ? Date.now() : undefined }));
    case 'archived':
      return patch(s, a.id, (r) => ({ ...r, archivedAt: a.on ? Date.now() : undefined, createdAt: a.on ? r.createdAt : Date.now() }));
    case 'create':
      return {
        ...s,
        requests: [
          { id: uid(), teamId: a.teamId, authorId: s.viewerId, title: a.title, body: a.body, createdAt: Date.now(), prayedBy: [], entries: [], following: true },
          ...s.requests,
        ],
      };
    case 'delete':
      return { ...s, requests: s.requests.filter((r) => r.id !== a.id) };
    case 'report':
      return patch(s, a.id, (r) => ({ ...r, reportedByViewer: true }));
    case 'block':
      return { ...s, blocked: [...s.blocked, a.memberId] };
    case 'follow':
      return patch(s, a.id, (r) => ({ ...r, following: !r.following }));
    case 'mute':
      return { ...s, teams: s.teams.map((t) => (t.id === a.teamId ? { ...t, muted: !t.muted } : t)) };
    case 'push':
      return { ...s, push: { ...s.push, [a.key]: !s.push[a.key] } };
    case 'readAll':
      return { ...s, notices: s.notices.map((n) => ({ ...n, read: true })) };
    case 'team':
      return { ...s, teamId: a.teamId };
  }
}

const Ctx = createContext<{ s: State; d: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(reducer, initial);
  return <Ctx.Provider value={{ s, d }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  const { s, d } = v;
  const name = (id: string | null) => (id === null ? 'Former member' : id === s.viewerId ? 'You' : s.members.find((m) => m.id === id)?.name ?? '?');
  const team = s.teams.find((t) => t.id === s.teamId)!;
  const visible = s.requests.filter((r) => r.teamId === s.teamId && !r.reportedByViewer && !(r.authorId && s.blocked.includes(r.authorId)));
  const status = (r: PrayerRequest): Status => (r.archivedAt ? 'archived' : r.answeredAt ? 'answered' : 'active');
  const byStatus = (st: Status) => visible.filter((r) => status(r) === st).sort((a, b) => b.createdAt - a.createdAt);
  const get = (id: string) => s.requests.find((r) => r.id === id);
  const entriesFor = (r: PrayerRequest) => r.entries.filter((e) => !s.blocked.includes(e.authorId));
  const unread = s.notices.filter((n) => !n.read).length;
  const isMine = (r: PrayerRequest) => r.authorId === s.viewerId;
  const prayed = (r: PrayerRequest) => r.prayedBy.includes(s.viewerId);
  const archivesIn = (r: PrayerRequest) => {
    const from = r.answeredAt ?? r.createdAt;
    const days = Math.max(0, Math.ceil(s.archiveDays - (Date.now() - from) / (24 * H)));
    return days;
  };
  return { s, d, name, team, byStatus, get, status, entriesFor, unread, isMine, prayed, archivesIn };
}

export function timeAgo(t: number) {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function prayedLine(names: string[]) {
  if (names.length === 0) return 'No one has prayed yet';
  if (names.length <= 2) return `Prayed by ${names.join(' and ')}`;
  return `Prayed by ${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

// Stand-in for the pre-post word-list filter (ADR: Report handling and pre-post content filtering).
const BLOCKED_WORDS = ['damn', 'hell'];
export function filterRefuses(text: string) {
  return BLOCKED_WORDS.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
}
