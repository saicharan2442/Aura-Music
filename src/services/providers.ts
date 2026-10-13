
import type { MusicProvider } from './provider';
import { ProviderError } from './provider';
import { itunesProvider } from './itunes';
import { audiusProvider } from './audius';
import { jamendoProvider } from './jamendo';
import { customProvider, customSourceUrl } from './custom';
import { useSettings } from '../store/settings';

/* ------------------------------------------------------------------ */
/*  Provider facade with automatic failover.                          */
/*                                                                    */
/*  • "Auto" tries providers in order; an unhealthy provider is       */
/*    skipped for a while instead of breaking the app.                */
/*  • Entity ids are prefixed per provider so detail pages always     */
/*    resolve against the right source (aud:/aup:, jmalb:/jmart:,     */
/*    cs:, itunes numeric ids).                                       */
/*  • Jamendo & Custom Source join the rotation only when configured. */
/* ------------------------------------------------------------------ */

import { archiveProvider } from './archive';
import { youtubeProvider } from './youtube';

const ALWAYS = [itunesProvider, youtubeProvider, audiusProvider, archiveProvider];

/** providers usable right now (config-dependent ones included when set up) */
export function getProviders(): MusicProvider[] {
  const s = useSettings.getState();
  const list: MusicProvider[] = [...ALWAYS];
  if (customSourceUrl()) list.unshift(customProvider);
  if (s.jamendoKey.trim()) list.push(jamendoProvider);
  return list;
}

const unhealthyUntil = new Map<string, number>();
const HEALTH_COOLDOWN = 10_000;

function order(): MusicProvider[] {
  const pref = useSettings.getState().provider;
  const all = getProviders();
  if (pref !== 'all') {
    const chosen = all.find((p) => p.id === pref);
    return chosen ? [chosen, ...all.filter(p => p.id !== pref)] : all;
  }
  const healthy: MusicProvider[] = [];
  const cooling: MusicProvider[] = [];
  for (const p of all) {
    ((unhealthyUntil.get(p.id) ?? 0) > Date.now() ? cooling : healthy).push(p);
  }
  return [...healthy, ...cooling];
}

async function withFailover<T>(fn: (p: MusicProvider) => Promise<T>): Promise<T> {
  const ps = order();
  let lastErr: unknown = null;
  for (const p of ps) {
    if ((unhealthyUntil.get(p.id) ?? 0) > Date.now() && ps.length > 1) continue;
    try {
      const result = await fn(p);
      unhealthyUntil.delete(p.id);
      return result;
    } catch (e: any) {
      if (e?.message === 'cancelled') throw e;
      lastErr = e;
      unhealthyUntil.set(p.id, Date.now() + HEALTH_COOLDOWN);
    }
  }
  if (lastErr instanceof ProviderError) throw lastErr;
  throw new ProviderError('No music provider is reachable right now');
}

async function aggregate<T>(
  fn: (p: MusicProvider) => Promise<T>,
  merge: (results: T[]) => T
): Promise<T> {
  const pref = useSettings.getState().provider;
  if (pref !== 'all') return withFailover(fn);
  
  const ps = order();
  const results = await Promise.allSettled(ps.map(p => {
    return fn(p).catch(e => {
      if (e?.message !== 'cancelled') unhealthyUntil.set(p.id, Date.now() + HEALTH_COOLDOWN);
      throw e;
    });
  }));
  
  const successful = results
    .filter((r) => r.status === 'fulfilled')
    .map((r: any) => r.value as T);
    
  if (successful.length === 0) {
    const firstErr = results.find(r => r.status === 'rejected');
    if (firstErr && (firstErr as any).reason?.message === 'cancelled') {
      throw (firstErr as any).reason;
    }
    return merge([]);
  }
  
  return merge(successful);
}

function resolveByPrefix(id: string): MusicProvider | null {
  if (id.startsWith('aup:') || id.startsWith('aud:') || id.startsWith('audt:')) return audiusProvider;
  if (id.startsWith('jmalb:') || id.startsWith('jmart:') || id.startsWith('jmt:')) return jamendoProvider;
  if (id.startsWith('arc:') || id.startsWith('arct:')) return archiveProvider;
  if (id.startsWith('ytv:') || id.startsWith('ytp:') || id.startsWith('ytc:')) return youtubeProvider;
  if (id.startsWith('cs')) return customSourceUrl() ? customProvider : null;
  return null;
}

function interleave<T>(arrays: T[][]): T[] {
  const result: T[] = [];
  const maxLen = Math.max(...arrays.map(a => a.length));
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (arr[i]) result.push(arr[i]);
    }
  }
  return result;
}

export const activeProvider: MusicProvider = {
  id: 'all',
  name: 'All (Merged)',
  attribution: getAttributions().map((a) => a.text).join(' '),

  searchSongs: (q, limit, signal) => aggregate(
    (p) => p.searchSongs(q, limit, signal),
    (results) => interleave(results)
  ),
  
  searchAll: (q, signal) => aggregate(
    (p) => p.searchAll(q, signal),
    (results) => ({
      top: results.map(r => r.top).filter(Boolean)[0],
      songs: interleave(results.map(r => r.songs)),
      albums: interleave(results.map(r => r.albums)),
      artists: interleave(results.map(r => r.artists)),
    })
  ),
  
  suggestions: (q, signal) => aggregate(
    (p) => p.suggestions(q, signal),
    (results) => interleave(results)
  ),
  
  homeFeed: () => aggregate(
    (p) => p.homeFeed(),
    (results) => ({
      charts: interleave(results.map(r => r.charts)),
      artists: interleave(results.map(r => r.artists)),
      topAlbums: interleave(results.map(r => r.topAlbums)),
      newReleases: interleave(results.map(r => r.newReleases)),
    })
  ),
  
  albumDetail: (id) => {
    const r = resolveByPrefix(id);
    return r ? r.albumDetail(id) : withFailover((p) => p.albumDetail(id));
  },
  
  artistDetail: (id) => {
    const r = resolveByPrefix(id);
    return r ? r.artistDetail(id) : withFailover((p) => p.artistDetail(id));
  },
  
  genreTop: (genreId, limit) => aggregate(
    (p) => p.genreTop(genreId, limit),
    (results) => interleave(results)
  ),
  
  genreAlbums: (genreId, limit) => aggregate(
    (p) => p.genreAlbums(genreId, limit),
    (results) => interleave(results)
  ),
};

export function getAttributions(): { name: string; text: string }[] {
  const out = getProviders().map((p) => ({ name: p.name, text: p.attribution }));
  return out;
}

/** currently-active provider name for UI display (best guess) */
export function activeProviderName(): string {
  const pref = useSettings.getState().provider;
  if (pref !== 'all') return getProviders().find((p) => p.id === pref)?.name ?? 'All';
  return 'All';
}
