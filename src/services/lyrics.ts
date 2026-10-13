/* ------------------------------------------------------------------ */
/*  Lyrics Service — Time-synced (LRC) & Plain Lyrics fetcher        */
/*  Supports LRCLIB.net, lyrics.ovh, and Local Custom User Lyrics     */
/* ------------------------------------------------------------------ */

export interface LyricLine {
  time: number; // in seconds (-1 for un-synced plain lyrics)
  text: string;
}

export interface LyricsData {
  synced: boolean;
  lines: LyricLine[];
  plain?: string;
  source: string;
}

const cache = new Map<string, LyricsData>();

function getStorageKey(title: string, artist: string) {
  const t = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `aura_custom_lyrics_${t}_${a}`;
}

export function saveCustomLyrics(title: string, artist: string, content: string): LyricsData {
  const parsed = parseLrc(content);
  let data: LyricsData;
  if (parsed.length > 0) {
    data = {
      synced: true,
      lines: parsed,
      plain: parsed.map((l) => l.text).join('\n'),
      source: 'Custom (Time-Synced)',
    };
  } else {
    const lines = content
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ time: -1, text }));
    data = {
      synced: false,
      lines,
      plain: content,
      source: 'Custom (Plain)',
    };
  }

  try {
    localStorage.setItem(getStorageKey(title, artist), JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save custom lyrics to localStorage', e);
  }

  const cacheKey = `${title}_${artist}`.toLowerCase();
  cache.set(cacheKey, data);
  return data;
}

export function getCustomLyrics(title: string, artist: string): LyricsData | null {
  try {
    const raw = localStorage.getItem(getStorageKey(title, artist));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/**
 * Parses LRC format: [mm:ss.xx] Lyric text
 */
export function parseLrc(lrcText: string): LyricLine[] {
  const rawLines = lrcText.split('\n');
  const result: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(regex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      const time = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Cleans YouTube titles to isolate the actual song title and main artist.
 */
export function cleanTitleAndArtist(rawTitle: string, rawArtist: string): { title: string; artist: string; queries: string[] } {
  let cleaned = rawTitle
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
    .replace(/\b(official\s*(music)?\s*(video|audio|lyric|lyrics|lyrical)?)\b/gi, ' ')
    .replace(/\b(full\s*(video|audio|song|movie\s*song)?)\b/gi, ' ')
    .replace(/\b(video\s*song|audio\s*song|lyric\s*video|lyrics\s*video|lyrical\s*video)\b/gi, ' ')
    .replace(/\b(4k|hd|1080p|720p|remastered|extended|visualizer|teaser|trailer)\b/gi, ' ')
    .replace(/\b(slowed\s*(\+|\&)?\s*reverb|slowed|reverb|speed\s*up|sped\s*up|8d\s*audio|bass\s*boosted|lofi|lo-fi)\b/gi, ' ')
    .replace(/\b(hindi|telugu|tamil|punjabi|english|bhojpuri|kannada|malayalam|bengali|marathi)\s*(song|songs)?\b/gi, ' ')
    .replace(/\b(feat\.|ft\.|featuring|prod\.|produced\s*by)\b.*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into candidate segments using common separators
  const segments = cleaned
    .split(/\s*[\-\|—_•\/:~]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  let primaryTitle = segments[0] || cleaned || rawTitle;

  // Clean artist: remove generic channel noise
  let artist = rawArtist
    .replace(/\b(official|vevo|records|music|channel|topic|entertainment|films|series|studio|studios|company|india)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (artist.toLowerCase() === 'youtube' || artist.toLowerCase() === 'various artists') {
    artist = '';
  }

  const queries: string[] = [];

  // Query variations:
  if (segments.length >= 2) {
    // If format is "Artist - Song": segment 1 is song, segment 0 is artist
    queries.push(`${segments[1]} ${segments[0]}`.trim());
    queries.push(segments[1]);
    queries.push(`${segments[0]} ${segments[1]}`.trim());
    queries.push(segments[0]);
  } else {
    queries.push(primaryTitle);
  }

  if (artist) {
    queries.push(`${primaryTitle} ${artist}`.trim());
  }
  queries.push(cleaned);

  const uniqueQueries = [...new Set(queries.filter((q) => q && q.length > 1))];

  return { title: primaryTitle, artist, queries: uniqueQueries };
}

/**
 * Fetch lyrics with automatic fallback to multiple endpoints.
 */
export async function fetchLyrics(title: string, artist: string): Promise<LyricsData | null> {
  // 1. Check if user saved custom lyrics for this track
  const custom = getCustomLyrics(title, artist);
  if (custom) return custom;

  const cacheKey = `${title}_${artist}`.toLowerCase();
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const cleaned = cleanTitleAndArtist(title, artist);

  // 2. Try LRCLIB direct get endpoint if artist is known and not generic
  if (cleaned.artist && cleaned.artist.length > 1) {
    try {
      const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleaned.title)}&artist_name=${encodeURIComponent(cleaned.artist)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.syncedLyrics) {
          const lines = parseLrc(data.syncedLyrics);
          if (lines.length > 0) {
            const result: LyricsData = { synced: true, lines, plain: data.plainLyrics, source: 'LRCLIB' };
            cache.set(cacheKey, result);
            return result;
          }
        }
        if (data.plainLyrics) {
          const lines = data.plainLyrics
            .split('\n')
            .map((t: string) => t.trim())
            .filter(Boolean)
            .map((text: string) => ({ time: -1, text }));
          const result: LyricsData = { synced: false, lines, plain: data.plainLyrics, source: 'LRCLIB' };
          cache.set(cacheKey, result);
          return result;
        }
      }
    } catch {}
  }

  // 3. Try LRCLIB search endpoint with smart candidate queries
  for (const q of cleaned.queries) {
    try {
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          // Prefer item with synced lyrics
          const item = results.find((r: any) => r && r.syncedLyrics) || results[0];
          if (item?.syncedLyrics) {
            const lines = parseLrc(item.syncedLyrics);
            if (lines.length > 0) {
              const result: LyricsData = { synced: true, lines, plain: item.plainLyrics, source: 'LRCLIB' };
              cache.set(cacheKey, result);
              return result;
            }
          }
          if (item?.plainLyrics) {
            const lines = item.plainLyrics
              .split('\n')
              .map((t: string) => t.trim())
              .filter(Boolean)
              .map((text: string) => ({ time: -1, text }));
            const result: LyricsData = { synced: false, lines, plain: item.plainLyrics, source: 'LRCLIB' };
            cache.set(cacheKey, result);
            return result;
          }
        }
      }
    } catch {}
  }

  // 4. Fallback to lyrics.ovh for plain lyrics
  if (cleaned.artist) {
    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(cleaned.artist)}/${encodeURIComponent(cleaned.title)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.lyrics) {
          const lines = data.lyrics
            .split('\n')
            .map((t: string) => t.trim())
            .filter(Boolean)
            .map((text: string) => ({ time: -1, text }));
          const result: LyricsData = { synced: false, lines, plain: data.lyrics, source: 'lyrics.ovh' };
          cache.set(cacheKey, result);
          return result;
        }
      }
    } catch {}
  }

  return null;
}
