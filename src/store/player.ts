import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RepeatMode, Track } from '../types';
import { shuffleArray, uid } from '../utils';
import { useLibrary } from './library';

/* ------------------------------------------------------------------ */
/*  Player store — queue, order, transport state.                     */
/*  The actual <audio> elements live in components/AudioEngine.       */
/* ------------------------------------------------------------------ */

export interface QueueItem extends Track { qid: string; }

const qi = (t: Track): QueueItem => ({ ...t, qid: uid('q') });

interface PlayerState {
  queue: QueueItem[];
  order: string[];        // qid play order (supports shuffle + manual reorder)
  pos: number;            // pointer into order
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  speed: number;

  current: () => QueueItem | null;
  upNext: () => QueueItem[];
  peekNext: () => QueueItem | null;
  hasNext: () => boolean;

  playContext: (tracks: Track[], start: number) => void;
  playTrack: (t: Track) => void;
  playNext: (t: Track) => void;
  enqueue: (t: Track) => void;

  toggle: () => void;
  setPlaying: (b: boolean) => void;
  next: () => void;
  prev: () => void;
  jump: (qid: string) => void;
  /** transport advance; returns true if a new track should play */
  advance: (natural: boolean) => boolean;
  playQueueItem: (qid: string) => void;

  seek: (t: number) => void;
  setPosition: (t: number) => void;
  setDuration: (d: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setSpeed: (s: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;

  removeFromQueue: (qid: string) => void;
  clearQueue: () => void;
  reorderUpNext: (qids: string[]) => void;
  snapshotTracks: () => Track[];
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      order: [],
      pos: 0,
      isPlaying: false,
      position: 0,
      duration: 0,
      volume: 0.85,
      muted: false,
      shuffle: false,
      repeat: 'off',
      speed: 1,

      current: () => {
        const { queue, order, pos } = get();
        const qid = order[pos];
        return queue.find((q) => q.qid === qid) ?? null;
      },

      upNext: () => {
        const { queue, order, pos } = get();
        const byId = new Map(queue.map((q) => [q.qid, q]));
        return order.slice(pos + 1).map((id) => byId.get(id)).filter(Boolean) as QueueItem[];
      },

      peekNext: () => {
        const { repeat } = get();
        const next = get().upNext();
        if (next.length) return next[0];
        if (repeat === 'all' && get().queue.length) {
          const { queue, order } = get();
          return queue.find((q) => q.qid === order[0]) ?? null;
        }
        return null;
      },

      hasNext: () => get().peekNext() != null,

      playContext: (tracks, start) => {
        const items = tracks.map(qi);
        if (!items.length) return;
        const startQid = items[Math.max(0, Math.min(start, items.length - 1))].qid;
        const identity = items.map((i) => i.qid);
        const shuffle = get().shuffle;
        const order = shuffle ? [startQid, ...shuffleArray(identity.filter((q) => q !== startQid))] : identity;
        const pos = shuffle ? 0 : identity.indexOf(startQid);
        set({ queue: items, order, pos, isPlaying: true, position: 0, duration: 0 });
        const cur = items.find((i) => i.qid === startQid);
        if (cur) useLibrary.getState().addRecent(cur);
      },

      playTrack: (t) => get().playContext([t], 0),

      playNext: (t) => {
        const { queue, order, pos, shuffle, current } = get();
        if (!current()) { get().playTrack(t); return; }
        const item = qi(t);
        const curQid = order[pos];
        const insertAt = queue.findIndex((q) => q.qid === curQid) + 1;
        const nq = [...queue];
        nq.splice(insertAt, 0, item);
        let no: string[];
        if (shuffle) {
          no = [...order];
          no.splice(pos + 1, 0, item.qid);
        } else {
          no = nq.map((q) => q.qid);
        }
        set({ queue: nq, order: no, pos: shuffle ? pos : insertAt - 1 });
      },

      enqueue: (t) => {
        const { queue, order } = get();
        if (!queue.length) { get().playTrack(t); return; }
        const item = qi(t);
        set({ queue: [...queue, item], order: [...order, item.qid] });
      },

      toggle: () => {
        const c = get().current();
        if (!c) return;
        set({ isPlaying: !get().isPlaying });
      },
      setPlaying: (b) => set({ isPlaying: b }),

      next: () => { get().advance(false); },

      prev: () => {
        const { position, pos } = get();
        if (position > 3 || pos === 0) set({ position: 0 });
        else set({ pos: pos - 1, position: 0, isPlaying: true });
      },

      jump: (qid) => {
        const { order } = get();
        const idx = order.indexOf(qid);
        if (idx >= 0) set({ pos: idx, position: 0, isPlaying: true });
      },

      playQueueItem: (qid) => {
        const { queue, order } = get();
        const item = queue.find((q) => q.qid === qid);
        if (!item) return;
        const idx = order.indexOf(qid);
        if (idx < 0) return;
        set({ pos: idx, position: 0, isPlaying: true });
        useLibrary.getState().addRecent(item);
      },

      advance: (natural) => {
        const { order, pos, repeat } = get();
        if (repeat === 'one' && natural) { set({ position: 0, isPlaying: true }); return true; }
        if (pos + 1 < order.length) {
          set({ pos: pos + 1, position: 0, isPlaying: true });
          const c = get().current();
          if (c) useLibrary.getState().addRecent(c);
          return true;
        }
        if (repeat === 'all' && order.length) {
          set({ pos: 0, position: 0, isPlaying: true });
          const c = get().current();
          if (c) useLibrary.getState().addRecent(c);
          return true;
        }
        set({ isPlaying: false, position: get().duration });
        return false;
      },

      seek: (t) => {
        const target = Math.max(0, t);
        set({ position: target });
        if (typeof (window as any).__aura_yt_seek === 'function') {
          (window as any).__aura_yt_seek(target);
        }
      },
      setPosition: (t) => set({ position: t }),
      setDuration: (d) => set({ duration: isFinite(d) ? d : 0 }),

      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), muted: v === 0 ? get().muted : false }),
      toggleMute: () => set({ muted: !get().muted }),
      setSpeed: (s) => set({ speed: s }),

      toggleShuffle: () => {
        const { shuffle, queue, order, pos } = get();
        const curQid = order[pos];
        if (!shuffle) {
          const rest = queue.map((q) => q.qid).filter((q) => q !== curQid);
          set({ shuffle: true, order: curQid ? [curQid, ...shuffleArray(rest)] : shuffleArray(rest), pos: curQid ? 0 : 0 });
        } else {
          const identity = queue.map((q) => q.qid);
          set({ shuffle: false, order: identity, pos: Math.max(0, identity.indexOf(curQid)) });
        }
      },

      cycleRepeat: () => {
        const r = get().repeat;
        set({ repeat: r === 'off' ? 'all' : r === 'all' ? 'one' : 'off' });
      },

      removeFromQueue: (qid) => {
        const { queue, order, pos, current } = get();
        const cur = current();
        const queuePos = queue.findIndex((q) => q.qid === qid);
        const nq = queue.filter((q) => q.qid !== qid);
        const no = order.filter((id) => id !== qid);
        if (cur?.qid === qid) {
          // removing the playing item → advance within new order
          if (!no.length) { set({ queue: [], order: [], pos: 0, isPlaying: false, position: 0, duration: 0 }); return; }
          const npos = Math.min(pos, no.length - 1);
          set({ queue: nq, order: no, pos: npos, position: 0, isPlaying: true });
          const c = nq.find((q) => q.qid === no[npos]);
          if (c) useLibrary.getState().addRecent(c);
          return;
        }
        const curIdx = no.indexOf(cur?.qid ?? '');
        void queuePos;
        set({ queue: nq, order: no, pos: Math.max(0, curIdx) });
      },

      clearQueue: () => {
        const c = get().current();
        if (!c) { set({ queue: [], order: [], pos: 0, position: 0, duration: 0 }); return; }
        set({ queue: [c], order: [c.qid], pos: 0 });
      },

      reorderUpNext: (qids) => {
        const { order, pos } = get();
        set({ order: [...order.slice(0, pos + 1), ...qids] });
      },

      snapshotTracks: () => {
        const { queue, order } = get();
        const byId = new Map(queue.map((q) => [q.qid, q]));
        return order.map((id) => byId.get(id)).filter(Boolean) as Track[];
      },
    }),
    {
      name: 'aura-player-v1',
      partialize: (s) => ({ queue: s.queue, order: s.order, pos: s.pos, volume: s.volume, shuffle: s.shuffle, repeat: s.repeat, speed: s.speed }),
      merge: (persisted: any, current) => ({
        ...current,
        ...(persisted ?? {}),
        isPlaying: false,
        position: 0,
        duration: 0,
        muted: false,
      }),
    }
  )
);
