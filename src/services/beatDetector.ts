/* ------------------------------------------------------------------ */
/*  Acoustic Beat & Tempo Detector for Aura Music                     */
/*  Combines acoustic audio analysis, pattern matching, and tap-sync  */
/* ------------------------------------------------------------------ */

export interface BeatAnalysis {
  bpm: number;
  offset: number;
  source: 'acoustic' | 'catalog' | 'heuristic' | 'tap';
}

const bpmCache = new Map<string, BeatAnalysis>();

// Curated catalog of known popular song tempos & downbeat offsets
const KNOWN_CATALOG: Record<string, { bpm: number; offset: number }> = {
  'tum hi aana': { bpm: 90, offset: 0.35 },
  'marjaavaan': { bpm: 90, offset: 0.35 },
  'pacha bottu': { bpm: 136, offset: 0.0 },
  'na gunde': { bpm: 136, offset: 0.0 },
  'na_gunde': { bpm: 136, offset: 0.0 },
  'pehle bhi main': { bpm: 92, offset: 0.4 },
  'animal': { bpm: 92, offset: 0.4 },
  'kesariya': { bpm: 88, offset: 0.25 },
  'brahmastra': { bpm: 88, offset: 0.25 },
  'chaleya': { bpm: 122, offset: 0.15 },
  'jawan': { bpm: 122, offset: 0.15 },
  'tauba tauba': { bpm: 112, offset: 0.0 },
  'karan aujla': { bpm: 112, offset: 0.0 },
  'kabhi jo baadal': { bpm: 128, offset: 0.3 },
  'believer': { bpm: 125, offset: 0.2 },
  'imagine dragons': { bpm: 125, offset: 0.2 },
  'faded': { bpm: 90, offset: 0.4 },
  'alan walker': { bpm: 90, offset: 0.4 },
  'alone': { bpm: 142, offset: 0.1 },
  'marshmello': { bpm: 142, offset: 0.1 },
  'spectre': { bpm: 128, offset: 0.0 },
  'shape of you': { bpm: 96, offset: 0.2 },
  'despacito': { bpm: 89, offset: 0.3 },
  'levitating': { bpm: 103, offset: 0.1 },
  'blinding lights': { bpm: 171, offset: 0.05 },
  'stay': { bpm: 170, offset: 0.1 },
  'naatu naatu': { bpm: 152, offset: 0.0 },
  'oo antava': { bpm: 105, offset: 0.2 },
  'arabic kuthu': { bpm: 128, offset: 0.1 },
  'kaavaalaa': { bpm: 128, offset: 0.1 },
  'illuminati': { bpm: 132, offset: 0.0 },
  'bad guy': { bpm: 135, offset: 0.0 },
  'senorita': { bpm: 117, offset: 0.2 },
  'closer': { bpm: 95, offset: 0.1 },
  'starboy': { bpm: 93, offset: 0.15 },
  'kala chashma': { bpm: 138, offset: 0.0 },
  'gallan goodiyaan': { bpm: 128, offset: 0.0 },
  'london thumakda': { bpm: 128, offset: 0.0 },
  'dhoom machale': { bpm: 130, offset: 0.0 },
  'jai ho': { bpm: 135, offset: 0.0 },
};

/**
 * Intelligent heuristic fallback based on song title & genre keywords.
 */
export function getHeuristicBpm(title: string = '', artist: string = ''): BeatAnalysis {
  const text = `${title} ${artist}`.toLowerCase();

  // 1. Explicit BPM in title (e.g. "136 BPM", "128bpm")
  const bpmMatch = text.match(/(\d{2,3})\s*bpm/);
  if (bpmMatch) {
    const val = parseInt(bpmMatch[1], 10);
    if (val >= 60 && val <= 200) {
      return { bpm: val, offset: 0.0, source: 'heuristic' };
    }
  }

  // 2. Known song catalog lookup
  for (const [key, info] of Object.entries(KNOWN_CATALOG)) {
    if (text.includes(key)) {
      return { bpm: info.bpm, offset: info.offset, source: 'catalog' };
    }
  }

  // 3. Genre & Style Heuristics
  // South Indian / DJ / Dappu / Teenmaar / Festival remixes (standard 136 BPM)
  if (text.includes('teenmaar') || text.includes('dappu') || text.includes('folk') || text.includes('folkmix') || text.includes('dhol')) {
    return { bpm: 136, offset: 0.0, source: 'heuristic' };
  }
  if (text.includes('dj') && (text.includes('remix') || text.includes('dance') || text.includes('mix') || text.includes('song'))) {
    return { bpm: 136, offset: 0.0, source: 'heuristic' };
  }
  if (text.includes('remix') || text.includes('club') || text.includes('dance') || text.includes('edm') || text.includes('party')) {
    return { bpm: 130, offset: 0.0, source: 'heuristic' };
  }
  if (text.includes('mashup')) {
    return { bpm: 128, offset: 0.0, source: 'heuristic' };
  }
  if (text.includes('trap') || text.includes('bass boosted') || text.includes('subwoofer') || text.includes('heavy bass')) {
    return { bpm: 140, offset: 0.0, source: 'heuristic' };
  }
  if (text.includes('speed') || text.includes('sped up') || text.includes('nightcore') || text.includes('fast') || text.includes('rock')) {
    return { bpm: 150, offset: 0.0, source: 'heuristic' };
  }
  if (text.includes('slow') || text.includes('sad') || text.includes('lofi') || text.includes('romantic') || text.includes('arijit') || text.includes('jubin') || text.includes('shreya')) {
    return { bpm: 78, offset: 0.3, source: 'heuristic' };
  }
  if (text.includes('hip hop') || text.includes('rap') || text.includes('r&b') || text.includes('desi') || text.includes('punjabi') || text.includes('sidhu') || text.includes('shubh')) {
    return { bpm: 98, offset: 0.1, source: 'heuristic' };
  }

  return { bpm: 124, offset: 0.0, source: 'heuristic' };
}

/**
 * Autocorrelation beat detection algorithm on PCM AudioBuffer.
 * Analyzes audio energy envelope to calculate acoustic BPM.
 */
export function analyzeAudioBufferBpm(buffer: AudioBuffer): number | null {
  try {
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);
    const analyzeSamples = Math.min(channelData.length, Math.floor(sampleRate * 16));

    // Envelope window: 10ms (100 Hz envelope rate)
    const windowSize = Math.floor(sampleRate / 100);
    const envelope: number[] = [];

    for (let i = 0; i < analyzeSamples; i += windowSize) {
      let sum = 0;
      const end = Math.min(i + windowSize, analyzeSamples);
      for (let j = i; j < end; j++) {
        sum += Math.abs(channelData[j]);
      }
      envelope.push(sum / (end - i));
    }

    // Onset novelty curve
    const diff: number[] = [];
    for (let i = 1; i < envelope.length; i++) {
      diff.push(Math.max(0, envelope[i] - envelope[i - 1]));
    }

    if (diff.length < 200) return null;

    let bestBpm = 120;
    let maxScore = -1;

    // Search BPM range 65 to 175 with 0.5 BPM precision
    for (let candidate = 65; candidate <= 175; candidate += 0.5) {
      const lag = Math.round((60 / candidate) * 100);
      let corr = 0;
      let count = 0;

      for (let i = 0; i < diff.length - lag; i++) {
        corr += diff[i] * diff[i + lag];
        count++;
      }

      if (count > 0) {
        corr /= count;
        if (corr > maxScore) {
          maxScore = corr;
          bestBpm = candidate;
        }
      }
    }

    return Math.round(bestBpm);
  } catch (e) {
    console.warn('AudioBuffer BPM analysis error:', e);
    return null;
  }
}

let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Fetch acoustic preview and detect true BPM in background.
 */
export async function detectAcousticBpm(title: string, artist: string): Promise<BeatAnalysis | null> {
  const cacheKey = `${title}_${artist}`.toLowerCase();
  if (bpmCache.has(cacheKey)) return bpmCache.get(cacheKey)!;

  try {
    // Clean search query
    const cleanTitle = title
      .replace(/\(.*?\)|\{.*?\}|\[.*?\]/g, '')
      .replace(/ft\..*|feat\..*|official|video|audio|lyrics|remix|hd|4k/gi, '')
      .trim();
    const query = `${cleanTitle} ${artist}`.trim();

    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const previewUrl = data.results?.[0]?.previewUrl;

    if (!previewUrl) return null;

    const audioRes = await fetch(previewUrl);
    if (!audioRes.ok) return null;
    const arrayBuffer = await audioRes.arrayBuffer();

    const ctx = getAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const acousticBpm = analyzeAudioBufferBpm(audioBuffer);

    if (acousticBpm && acousticBpm >= 60 && acousticBpm <= 200) {
      const analysis: BeatAnalysis = {
        bpm: acousticBpm,
        offset: 0.0,
        source: 'acoustic',
      };
      bpmCache.set(cacheKey, analysis);
      return analysis;
    }
  } catch (e) {
    // Silent fallback
  }

  return null;
}
