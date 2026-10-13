import type { Album, SearchResults, Track } from '../types';
import type { AlbumDetail, ArtistDetail, MusicProvider } from './provider';
import { useSettings } from '../store/settings';
import { cached, jget } from './http';

/* ------------------------------------------------------------------ */
/*  YouTube Data API v3 provider                                      */
/*                                                                    */
/*  • Requires an API Key from Google Cloud Console                   */
/*  • Search returns video metadata                                   */
/*  • Streams are bridged through public instances                    */
/* ------------------------------------------------------------------ */

const API = 'https://www.googleapis.com/youtube/v3';

// Helper to get the key and throw if missing
function getKey() {
  const key = (useSettings.getState().youtubeKey || '').trim();
  if (!key) throw new Error('YouTube API key is missing. Please add it in Settings.');
  return key;
}

const u = (path: string, params: string) => `${API}${path}?key=${getKey()}&${params}`;

/* --------------------------- mapping ------------------------------ */

function parseIsoDuration(duration?: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  const h = parseInt(match[1]) || 0;
  const m = parseInt(match[2]) || 0;
  const s = parseInt(match[3]) || 0;
  return h * 3600 + m * 60 + s;
}

function mapVideoToTrack(item: any): Track {
  const id = item.id?.videoId || item.id;
  return {
    id: `ytv:${id}`,
    provider: 'youtube',
    title: item.snippet?.title || 'Unknown Title',
    artist: item.snippet?.channelTitle || 'YouTube',
    artistId: item.snippet?.channelId ? `ytc:${item.snippet.channelId}` : undefined,
    artwork: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
    artworkSmall: item.snippet?.thumbnails?.default?.url || '',
    duration: parseIsoDuration(item.contentDetails?.duration),
    streamUrl: `yt:${id}`, // Handled natively by YouTubePlayer
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

function mapPlaylistToAlbum(item: any): Album {
  const id = item.id?.playlistId || item.id;
  return {
    id: `ytp:${id}`,
    provider: 'youtube',
    title: item.snippet?.title || 'Unknown Playlist',
    artist: item.snippet?.channelTitle || 'YouTube',
    artistId: item.snippet?.channelId ? `ytc:${item.snippet.channelId}` : undefined,
    artwork: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
    url: `https://www.youtube.com/playlist?list=${id}`,
  };
}

/* --------------------------- endpoints ---------------------------- */

async function searchSongs(query: string, limit = 14, signal?: AbortSignal): Promise<Track[]> {
  const key = (useSettings.getState().youtubeKey || '').trim();
  if (key) {
    try {
      const json = await jget(u('/search', `part=snippet&type=video&videoCategoryId=10&maxResults=${limit}&q=${encodeURIComponent(query)}`), 9000, signal);
      if (json?.items?.length) {
        const ids = json.items.map((i: any) => i.id?.videoId).filter(Boolean).join(',');
        if (ids) {
          const details = await jget(u('/videos', `part=snippet,contentDetails&id=${ids}`), 9000, signal);
          return (details?.items || []).map(mapVideoToTrack);
        }
      }
    } catch (e) {
      console.warn('YouTube API search failed, falling back:', e);
    }
  }

  // Key-less search via proxy or public CORS
  try {
    let text = '';
    try {
      const res = await fetch(`/api/yt/results?search_query=${encodeURIComponent(query)}`, { signal });
      if (res.ok) text = await res.text();
    } catch {}

    if (!text) {
      const target = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`, { signal });
      if (res.ok) text = await res.text();
    }

    if (text) {
      const tracks: Track[] = [];
      const seen = new Set<string>();

      // Strategy 1: Extract ytInitialData JSON
      const jsonMatch = text.match(/(?:var\s+ytInitialData\s*=|window\["ytInitialData"\]\s*=|ytInitialData\s*=)\s*(\{[\s\S]+?\});\s*(?:<\/script>|\n)/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
          for (const sec of sections) {
            const items = sec?.itemSectionRenderer?.contents || [];
            for (const item of items) {
              const v = item?.videoRenderer;
              if (!v || !v.videoId || seen.has(v.videoId)) continue;
              seen.add(v.videoId);
              const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'Unknown Title';
              const artist = v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || 'YouTube';
              const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
              const durText = v.lengthText?.simpleText || '';
              let duration = 210;
              if (durText) {
                const parts = durText.split(':').map((p: string) => parseInt(p, 10));
                if (parts.length === 2) duration = parts[0] * 60 + parts[1];
                else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }
              tracks.push({
                id: `ytv:${v.videoId}`,
                provider: 'youtube',
                title,
                artist,
                artwork: thumb,
                artworkSmall: `https://i.ytimg.com/vi/${v.videoId}/default.jpg`,
                duration,
                streamUrl: `yt:${v.videoId}`,
                url: `https://www.youtube.com/watch?v=${v.videoId}`,
              });
              if (tracks.length >= limit) break;
            }
            if (tracks.length >= limit) break;
          }
        } catch {}
      }

      // Strategy 2: Robust multiline regex fallback
      if (tracks.length === 0) {
        const regex = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"[\s\S]*?"title":\{[\s\S]*?"text":"([^"]+)"\}[\s\S]*?(?:"ownerText"|"longBylineText"|"shortBylineText"):\{[\s\S]*?"text":"([^"]+)"\}/g;
        let m;
        while ((m = regex.exec(text)) !== null && tracks.length < limit) {
          const vid = m[1];
          if (seen.has(vid)) continue;
          seen.add(vid);
          tracks.push({
            id: `ytv:${vid}`,
            provider: 'youtube',
            title: m[2],
            artist: m[3] || 'YouTube',
            artwork: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            artworkSmall: `https://i.ytimg.com/vi/${vid}/default.jpg`,
            duration: 210,
            streamUrl: `yt:${vid}`,
            url: `https://www.youtube.com/watch?v=${vid}`,
          });
        }
      }

      if (tracks.length > 0) return tracks;
    }
  } catch (err) {
    console.error('YouTube keyless search error:', err);
  }

  return [];
}

async function searchPlaylists(query: string, limit = 10, signal?: AbortSignal): Promise<Album[]> {
  const key = (useSettings.getState().youtubeKey || '').trim();
  if (!key) return [];
  try {
    const json = await jget(u('/search', `part=snippet&type=playlist&maxResults=${limit}&q=${encodeURIComponent(query)}`), 9000, signal);
    return (json?.items || []).map(mapPlaylistToAlbum);
  } catch {
    return [];
  }
}

export async function resolveYoutubeBridgeCandidates(query: string): Promise<string[]> {
  const cacheKey = `ytbridge_cands:${query}`;
  return cached(cacheKey, 24 * 60 * 60 * 1000, async () => {
    const candidates: string[] = [];

    // Query with 'topic' first — official topic uploads allow embedded playback!
    const qTopic = `${query} topic`;
    try {
      const res = await fetch(`/api/yt/results?search_query=${encodeURIComponent(qTopic)}`);
      if (res.ok) {
        const text = await res.text();
        const matches = [...text.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
        candidates.push(...new Set(matches));
      }
    } catch {}

    // Also query with 'audio'
    if (candidates.length < 4) {
      try {
        const res = await fetch(`/api/yt/results?search_query=${encodeURIComponent(query + ' audio')}`);
        if (res.ok) {
          const text = await res.text();
          const matches = [...text.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
          for (const m of matches) {
            if (!candidates.includes(m)) candidates.push(m);
          }
        }
      } catch {}
    }

    // Fallback via CORS proxy if local proxy returned nothing
    if (!candidates.length) {
      try {
        const target = `https://www.youtube.com/results?search_query=${encodeURIComponent(qTopic)}`;
        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`);
        if (res.ok) {
          const text = await res.text();
          const matches = [...text.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
          candidates.push(...new Set(matches));
        }
      } catch {}
    }

    return candidates.slice(0, 6);
  });
}

export async function resolveYoutubeBridge(query: string): Promise<string | null> {
  const candidates = await resolveYoutubeBridgeCandidates(query);
  return candidates[0] || null;
}


/* ----------------------------- facade ------------------------------ */

export const youtubeProvider: MusicProvider = {
  id: 'youtube',
  name: 'YouTube',
  attribution: 'Search results and metadata provided by the YouTube Data API v3.',

  searchSongs,
  suggestions: (q, signal) => searchSongs(q, 6, signal),

  async searchAll(query: string, signal?: AbortSignal): Promise<SearchResults> {
    const [songs, albums] = await Promise.allSettled([
      searchSongs(query, 14, signal),
      searchPlaylists(query, 10, signal),
    ]);
    const songsArr = songs.status === 'fulfilled' ? songs.value : [];
    const albumsArr = albums.status === 'fulfilled' ? albums.value : [];
    if (signal?.aborted) throw new Error('cancelled');
    return {
      top: songsArr[0],
      songs: songsArr,
      albums: albumsArr,
      artists: [],
    };
  },

  homeFeed: async () => {
    // YouTube Data API has a videos chart endpoint
    const json = await cached('yt:chart', 15 * 60_000, () => jget(u('/videos', 'part=snippet,contentDetails&chart=mostPopular&videoCategoryId=10&maxResults=24'), 9000));
    const tracks = (json?.items || []).map(mapVideoToTrack);
    return {
      charts: tracks,
      artists: [],
      topAlbums: [],
      newReleases: [],
    };
  },

  async albumDetail(idPrefixed: string): Promise<AlbumDetail> {
    const id = idPrefixed.replace(/^ytp:/, '');
    const metaJson = await cached(`ytp:${id}`, 10 * 60_000, () => jget(u('/playlists', `part=snippet&id=${id}`), 9000));
    const meta = metaJson?.items?.[0];

    const itemsJson = await cached(`ytpi:${id}`, 10 * 60_000, () => jget(u('/playlistItems', `part=snippet&maxResults=50&playlistId=${id}`), 9000));
    
    const album = meta ? mapPlaylistToAlbum(meta) : { id: idPrefixed, provider: 'youtube', title: 'Playlist', artist: 'YouTube', artwork: '' };
    
    // Fetch durations for playlist items in bulk
    const itemIds = (itemsJson?.items || []).map((i: any) => i.snippet?.resourceId?.videoId).filter(Boolean).join(',');
    const details = itemIds ? await cached(`ytpidet:${id}`, 10 * 60_000, () => jget(u('/videos', `part=snippet,contentDetails&id=${itemIds}`), 9000)) : { items: [] };

    const tracks: Track[] = (details?.items || []).map((item: any) => {
      const track = mapVideoToTrack(item);
      track.album = album.title;
      track.albumId = album.id;
      return track;
    });

    return { album, tracks };
  },

  async artistDetail(idPrefixed: string): Promise<ArtistDetail> {
    return { artist: { id: idPrefixed, provider: 'youtube', name: 'YouTube Channel' }, topTracks: [], albums: [] };
  },

  genreTop: async () => [],
  genreAlbums: async () => [],
};
