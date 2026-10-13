import type { Album, Artist, HomeFeed, SearchResults, Track } from '../types';
import type { AlbumDetail, ArtistDetail, MusicProvider } from './provider';
import { ProviderError } from './provider';

/* ------------------------------------------------------------------ */
/*  Apple iTunes provider                                              */
/*                                                                     */
/*  Uses Apple's public, key-less, CORS-enabled interfaces:           */
/*   • iTunes Search API  (metadata + 30s preview streams)            */
/*   • Apple Marketing Tools RSS (public charts / new releases)       */
/*  No authentication, scraping, or restriction bypass is involved.   */
/*  Preview streams are served directly from Apple's CDN and are      */
/*  intended for exactly this kind of discovery experience.           */
/* ------------------------------------------------------------------ */

const API = 'https://itunes.apple.com';
const RSS = 'https://rss.applemarketingtools.com/api/v2/us/music';

/* ------------------------- low level helpers ---------------------- */

async function jget(url: string, timeoutMs = 9000, outer?: AbortSignal): Promise<any> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort();
  outer?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new ProviderError(`The music service returned ${res.status}`);
    return await res.json();
  } catch (e: any) {
    if (e instanceof ProviderError) throw e;
    if (ctl.signal.aborted && !outer?.aborted) throw new ProviderError('The request timed out — check your connection');
    if (outer?.aborted) throw new ProviderError('cancelled');
    throw new ProviderError('Could not reach the music service');
  } finally {
    window.clearTimeout(t);
    outer?.removeEventListener('abort', onAbort);
  }
}

/* tiny in-memory TTL cache (artwork + metadata only — never audio) */
const memCache = new Map<string, { v: any; exp: number }>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const e = memCache.get(key);
  if (e && e.exp > Date.now()) return Promise.resolve(e.v as T);
  return fn().then((v) => { memCache.set(key, { v, exp: Date.now() + ttlMs }); return v; });
}

const upscale = (url: string | undefined, size = 600): string =>
  url ? url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`) : '';

/* --------------------------- mapping ------------------------------ */

function mapTrack(r: any): Track {
  return {
    id: String(r.trackId),
    provider: 'itunes',
    title: r.trackName ?? 'Unknown title',
    artist: r.artistName ?? 'Unknown artist',
    artistId: r.artistId ? String(r.artistId) : undefined,
    album: r.collectionName,
    albumId: r.collectionId ? String(r.collectionId) : undefined,
    artwork: upscale(r.artworkUrl100, 600),
    artworkSmall: upscale(r.artworkUrl100, 100),
    duration: Math.round((r.trackTimeMillis ?? 30000) / 1000),
    streamUrl: r.previewUrl,
    genre: r.primaryGenreName,
    year: r.releaseDate ? String(r.releaseDate).slice(0, 4) : undefined,
    trackNumber: r.trackNumber,
    url: r.trackViewUrl,
  };
}

function mapAlbum(r: any): Album {
  return {
    id: String(r.collectionId),
    provider: 'itunes',
    title: r.collectionName ?? 'Unknown album',
    artist: r.artistName ?? 'Unknown artist',
    artistId: r.artistId ? String(r.artistId) : undefined,
    artwork: upscale(r.artworkUrl100, 600),
    year: r.releaseDate ? String(r.releaseDate).slice(0, 4) : undefined,
    genre: r.primaryGenreName,
    url: r.collectionViewUrl,
  };
}

const rawSongs = (json: any): any[] => (json?.results ?? []).filter((r: any) => r.wrapperType === 'track' && r.kind === 'song');

/* --------------------------- charts (RSS) ------------------------- */

interface RssItem {
  id: string; name: string; artistName: string; artistId?: string;
  artworkUrl100?: string; url?: string; releaseDate?: string;
}

async function rssSongs(feed: 'most-played' | 'new-releases', limit: number, genreId?: string): Promise<Track[]> {
  const g = genreId ? `/${genreId}` : '';
  const rss = await jget(`${RSS}/${feed}/${limit}${g}/songs.json`);
  const items: RssItem[] = rss?.feed?.results ?? [];
  if (!items.length) return [];
  const ids = items.map((i) => i.id).join(',');
  try {
    const look = await jget(`${API}/lookup?id=${ids}&country=US`, 12000);
    const byId = new Map<string, any>();
    rawSongs(look).forEach((r: any) => byId.set(String(r.trackId), r));
    const ordered = items
      .map((i) => byId.get(String(i.id)))
      .filter(Boolean)
      .map(mapTrack);
    if (ordered.length) return ordered;
  } catch {
    /* fall through to RSS-only mapping (no preview URLs) */
  }
  return items.map((i) => ({
    id: String(i.id),
    provider: 'itunes',
    title: i.name,
    artist: i.artistName,
    artwork: upscale(i.artworkUrl100, 600),
    artworkSmall: upscale(i.artworkUrl100, 100),
    duration: 30,
    year: i.releaseDate?.slice(0, 4),
    url: i.url,
  })) as Track[];
}

async function rssAlbums(feed: 'most-played' | 'new-releases', limit: number, genreId?: string): Promise<Album[]> {
  try {
    const g = genreId ? `/${genreId}` : '';
    const rss = await jget(`${RSS}/${feed}/${limit}${g}/albums.json`);
    const items: RssItem[] = rss?.feed?.results ?? [];
    return items.map((i) => ({
      id: String(i.id),
      provider: 'itunes',
      title: i.name,
      artist: i.artistName,
      artistId: i.artistId,
      artwork: upscale(i.artworkUrl100, 600),
      year: i.releaseDate?.slice(0, 4),
      url: i.url,
    }));
  } catch (err) {
    const query = feed === 'new-releases' ? new Date().getFullYear().toString() : 'hits';
    const json = await jget(`${API}/search?term=${query}&media=music&entity=album&limit=${limit}&country=US`, 9000);
    return (json?.results ?? []).filter((r: any) => r.wrapperType === 'collection').map(mapAlbum);
  }
}

/* --------------------------- search ------------------------------- */

async function searchSongs(query: string, limit = 28, signal?: AbortSignal): Promise<Track[]> {
  const q = encodeURIComponent(query.trim());
  try {
    const json = await jget(`${API}/search?term=${q}&media=music&entity=song&limit=${limit}`, 9000, signal);
    const songs = rawSongs(json).map(mapTrack);
    if (songs.length > 0) return songs;
  } catch {}
  const fallback = await jget(`${API}/search?term=${q}&media=music&entity=song&limit=${limit}&country=US`, 9000, signal);
  return rawSongs(fallback).map(mapTrack);
}

async function searchAlbums(query: string, limit = 12, signal?: AbortSignal): Promise<Album[]> {
  const q = encodeURIComponent(query.trim());
  try {
    const json = await jget(`${API}/search?term=${q}&media=music&entity=album&limit=${limit}`, 9000, signal);
    const albums = (json?.results ?? []).filter((r: any) => r.wrapperType === 'collection').map(mapAlbum);
    if (albums.length > 0) return albums;
  } catch {}
  const fallback = await jget(`${API}/search?term=${q}&media=music&entity=album&limit=${limit}&country=US`, 9000, signal);
  return (fallback?.results ?? []).filter((r: any) => r.wrapperType === 'collection').map(mapAlbum);
}

async function searchArtists(query: string, limit = 10, signal?: AbortSignal): Promise<Artist[]> {
  const q = encodeURIComponent(query.trim());
  const json = await jget(`${API}/search?term=${q}&media=music&entity=musicArtist&limit=${limit}`, 9000, signal);
  const artists: Artist[] = (json?.results ?? [])
    .filter((r: any) => r.wrapperType === 'artist')
    .map((r: any) => ({
      id: String(r.artistId),
      provider: 'itunes',
      name: r.artistName ?? 'Unknown',
      url: r.artistLinkUrl,
    }));
  return withArtistArt(artists, signal);
}

const artistArtCache = new Map<string, string | undefined>();
async function artistArtwork(id: string, signal?: AbortSignal): Promise<string | undefined> {
  if (artistArtCache.has(id)) return artistArtCache.get(id);
  try {
    const json = await jget(`${API}/lookup?id=${id}&entity=song&limit=1&country=US`, 7000, signal);
    const art = upscale(rawSongs(json)[0]?.artworkUrl100, 300);
    artistArtCache.set(id, art || undefined);
    return art || undefined;
  } catch {
    return undefined;
  }
}

async function withArtistArt(artists: Artist[], signal?: AbortSignal): Promise<Artist[]> {
  const enriched = await Promise.allSettled(
    artists.map(async (a) => ({ ...a, artwork: a.artwork ?? (await artistArtwork(a.id, signal)) }))
  );
  return enriched.map((r, i) => (r.status === 'fulfilled' ? r.value : artists[i]));
}

/* --------------------------- details ------------------------------ */

async function albumDetail(albumId: string): Promise<AlbumDetail> {
  const json = await cached(`album:${albumId}`, 10 * 60_000, () =>
    jget(`${API}/lookup?id=${albumId}&entity=song&limit=80&country=US`, 10000));
  const results = json?.results ?? [];
  const coll = results.find((r: any) => r.wrapperType === 'collection');
  const tracks = rawSongs(json).map(mapTrack).sort((a: Track, b: Track) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  return {
    album: coll ? mapAlbum(coll) : {
      id: albumId, provider: 'itunes', title: tracks[0]?.album ?? 'Album',
      artist: tracks[0]?.artist ?? '', artwork: tracks[0]?.artwork ?? '',
    },
    tracks,
  };
}

async function artistDetail(artistId: string): Promise<ArtistDetail> {
  const [songsJson, albumsJson] = await Promise.all([
    cached(`artistTop:${artistId}`, 10 * 60_000, () =>
      jget(`${API}/lookup?id=${artistId}&entity=song&limit=16&country=US`, 10000)),
    cached(`artistAlbums:${artistId}`, 10 * 60_000, () =>
      jget(`${API}/lookup?id=${artistId}&entity=album&limit=16&country=US`, 10000)),
  ]);
  const topTracks = rawSongs(songsJson).map(mapTrack);
  const albums = (albumsJson?.results ?? [])
    .filter((r: any) => r.wrapperType === 'collection' && (r.collectionType === 'Album' || r.collectionType == null))
    .map(mapAlbum);
  const first = (songsJson?.results ?? [])[0];
  return {
    artist: {
      id: artistId,
      provider: 'itunes',
      name: first?.artistName ?? 'Artist',
      artwork: topTracks[0] ? upscale(topTracks[0].artworkSmall, 300) : undefined,
      url: first?.artistViewUrl,
    },
    topTracks,
    albums,
  };
}

/* --------------------------- home feed ---------------------------- */

async function homeFeed(): Promise<HomeFeed> {
  const [songsRss, topAlb, newAlb] = await Promise.allSettled([
    jget(`${RSS}/most-played/24/songs.json`),
    rssAlbums('most-played', 14),
    rssAlbums('new-releases', 14),
  ]);
  if (songsRss.status !== 'fulfilled') throw new ProviderError('Could not load the home feed');

  const items: RssItem[] = songsRss.value?.feed?.results ?? [];
  const artistsMap = new Map<string, Artist>();
  items.forEach((i) => {
    if (i.artistId && !artistsMap.has(String(i.artistId))) {
      artistsMap.set(String(i.artistId), {
        id: String(i.artistId),
        provider: 'itunes',
        name: i.artistName,
        artwork: upscale(i.artworkUrl100, 300),
        url: i.url,
      });
    }
  });

  const ids = items.map((i) => i.id).join(',');
  let charts: Track[] = [];
  try {
    const look = await jget(`${API}/lookup?id=${ids}&country=US`, 12000);
    const byId = new Map<string, any>();
    rawSongs(look).forEach((r: any) => byId.set(String(r.trackId), r));
    charts = items.map((i) => byId.get(String(i.id))).filter(Boolean).map(mapTrack);
  } catch { /* previews unavailable — degrade gracefully */ }

  return {
    charts,
    artists: [...artistsMap.values()].slice(0, 12),
    topAlbums: topAlb.status === 'fulfilled' ? topAlb.value : [],
    newReleases: newAlb.status === 'fulfilled' ? newAlb.value : [],
  };
}

/* --------------------------- provider ------------------------------ */

export const itunesProvider: MusicProvider = {
  id: 'itunes',
  name: 'Apple iTunes',
  attribution: 'Metadata & previews provided by the Apple iTunes Search API and Apple Music public charts.',

  searchSongs,
  suggestions: (q, signal) => searchSongs(q, 6, signal),

  async searchAll(query: string, signal?: AbortSignal): Promise<SearchResults> {
    const [songs, albums, artists] = await Promise.allSettled([
      searchSongs(query, 14, signal),
      searchAlbums(query, 10, signal),
      searchArtists(query, 8, signal),
    ]);
    const songsArr = songs.status === 'fulfilled' ? songs.value : [];
    if (songs.status !== 'fulfilled' && albums.status !== 'fulfilled' && artists.status !== 'fulfilled') {
      if (signal?.aborted) throw new ProviderError('cancelled');
      throw new ProviderError('Search is unavailable right now');
    }
    return {
      top: songsArr[0],
      songs: songsArr,
      albums: albums.status === 'fulfilled' ? albums.value : [],
      artists: artists.status === 'fulfilled' ? artists.value : [],
    };
  },

  homeFeed: () => cached('home', 5 * 60_000, homeFeed),
  albumDetail,
  artistDetail,
  genreTop: (genreId, limit = 24) => cached(`genre:${genreId}`, 5 * 60_000, () => rssSongs('most-played', limit, genreId)),
  genreAlbums: (genreId, limit = 14) => cached(`genreAlb:${genreId}`, 5 * 60_000, () => rssAlbums('most-played', limit, genreId)),
};

/** provider registry — future adapters register here */
export const providers: MusicProvider[] = [itunesProvider];
export const activeProvider: MusicProvider = itunesProvider;
