import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlignLeft, Check, Copy, FileEdit, Mic2, Plus, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { usePlayer } from '../store/player';
import { fetchLyrics, saveCustomLyrics, type LyricsData } from '../services/lyrics';
import { cx } from '../utils';

interface LyricsViewProps {
  title: string;
  artist: string;
  accentColor?: string;
  accentColor2?: string;
  onClose?: () => void;
}

function getPreciseTime(): number {
  if (typeof (window as any).__aura_yt_time === 'number' && !isNaN((window as any).__aura_yt_time)) {
    return (window as any).__aura_yt_time;
  }
  const audios = document.querySelectorAll('audio');
  for (let i = 0; i < audios.length; i++) {
    const a = audios[i];
    if (!a.paused && a.currentTime > 0) return a.currentTime;
  }
  return usePlayer.getState().position;
}

export function LyricsView({
  title,
  artist,
  accentColor = 'var(--accent)',
  accentColor2 = 'var(--accent2)',
  onClose,
}: LyricsViewProps) {
  const [data, setData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [customSearch, setCustomSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingLyrics, setIsAddingLyrics] = useState(false);
  const [lyricsInputText, setLyricsInputText] = useState('');
  const [livePos, setLivePos] = useState<number>(0);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  const isPlaying = usePlayer((s) => s.isPlaying);
  const player = usePlayer.getState();

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  // Load lyrics for the active track
  const load = async (t: string, a: string) => {
    setLoading(true);
    try {
      const res = await fetchLyrics(t, a);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCustomSearch('');
    setIsSearching(false);
    setIsAddingLyrics(false);
    setIsUserScrolled(false);
    load(title, artist);
  }, [title, artist]);

  // High-frequency playback position tracker
  useEffect(() => {
    let raf = 0;
    const update = () => {
      setLivePos(getPreciseTime());
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // Calculate active line index based on live audio position
  const activeIndex = useMemo(() => {
    if (!data?.synced || data.lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < data.lines.length; i++) {
      if (livePos >= data.lines[i].time - 0.25) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [data?.synced, data?.lines, livePos]);

  // Center the active line strictly in the middle of the container
  const scrollActiveLineToMiddle = (index: number, smooth = true) => {
    const container = containerRef.current;
    const el = lineRefs.current[index];
    if (!container || !el) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    // Center of element in viewport coordinates
    const elCenter = elRect.top + elRect.height / 2;
    // Center of container in viewport coordinates
    const containerCenter = containerRect.top + container.clientHeight / 2;
    const delta = elCenter - containerCenter;

    if (Math.abs(delta) > 2) {
      isProgrammaticScrollRef.current = true;
      container.scrollTo({
        top: container.scrollTop + delta,
        behavior: smooth ? 'smooth' : 'auto',
      });

      // Clear programmatic flag after scroll animation completes
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 450);
    }
  };

  // Auto-scroll whenever active index changes till the end of the song
  useEffect(() => {
    if (!data?.synced || activeIndex < 0) return;

    // When lyric changes to next line, resume auto-scroll immediately
    setIsUserScrolled(false);
    scrollActiveLineToMiddle(activeIndex, true);
  }, [activeIndex, data?.synced]);

  // Detect manual user scrolling (wheel, touch, drag)
  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return;

    setIsUserScrolled(true);
    if (userScrollTimeoutRef.current) window.clearTimeout(userScrollTimeoutRef.current);
    // Auto-resume after 4 seconds of idle
    userScrollTimeoutRef.current = window.setTimeout(() => {
      setIsUserScrolled(false);
      if (activeIndex >= 0) {
        scrollActiveLineToMiddle(activeIndex, true);
      }
    }, 4000);
  };

  const copyPlain = () => {
    if (!data) return;
    const text = data.plain || data.lines.map((l) => l.text).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCustomSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSearch.trim()) return;
    load(customSearch.trim(), '');
    setIsSearching(false);
  };

  const handleSaveCustomLyrics = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lyricsInputText.trim()) return;
    const saved = saveCustomLyrics(title, artist, lyricsInputText.trim());
    setData(saved);
    setIsAddingLyrics(false);
  };

  return (
    <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-2 pb-2.5 shrink-0 z-20">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.16em] uppercase text-acc">
            <Mic2 size={13} className="text-acc" />
            {data?.synced ? 'Live Synced Lyrics' : data ? 'Lyrics' : 'Lyrics'}
          </span>
          {data?.synced && (
            <span className="px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-acc/15 text-acc border border-acc/25 flex items-center gap-1">
              <Sparkles size={9} /> Middle Auto-Scroll
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Resume Auto-scroll pill if scrolled away */}
          <AnimatePresence>
            {isUserScrolled && data?.synced && activeIndex >= 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => {
                  setIsUserScrolled(false);
                  scrollActiveLineToMiddle(activeIndex, true);
                }}
                className="chip !px-2.5 !py-1 text-[10px] font-semibold bg-acc text-white hover:opacity-90 shadow-md"
              >
                Center
              </motion.button>
            )}
          </AnimatePresence>

          <button
            onClick={() => {
              setIsSearching(!isSearching);
              setIsAddingLyrics(false);
            }}
            className={cx('icon-btn !w-8 !h-8 text-dim hover:text-white', isSearching && 'text-acc')}
            title="Search different song name"
          >
            <Search size={14} />
          </button>

          <button
            onClick={() => {
              setIsAddingLyrics(!isAddingLyrics);
              setIsSearching(false);
              setLyricsInputText(data?.plain || '');
            }}
            className={cx('icon-btn !w-8 !h-8 text-dim hover:text-white', isAddingLyrics && 'text-acc')}
            title="Add or paste custom lyrics"
          >
            <FileEdit size={14} />
          </button>

          {data && (
            <button
              onClick={copyPlain}
              className="icon-btn !w-8 !h-8 text-dim hover:text-white"
              title="Copy lyrics"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          )}

          <button
            onClick={() => load(title, artist)}
            className="icon-btn !w-8 !h-8 text-dim hover:text-white"
            title="Refresh lyrics"
          >
            <RefreshCw size={13} className={cx(loading && 'animate-spin text-acc')} />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="icon-btn !w-8 !h-8 text-dim hover:text-white"
              title="Close lyrics"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <AnimatePresence>
        {isSearching && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleCustomSearchSubmit}
            className="px-2 pb-3 shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white/10 border border-white/15">
              <input
                type="text"
                value={customSearch}
                onChange={(e) => setCustomSearch(e.target.value)}
                placeholder="Search song lyrics (e.g. Tum Hi Aana, Believer)..."
                className="flex-1 bg-transparent px-2 text-[12.5px] text-white placeholder:text-dim outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="px-3 py-1 rounded-lg bg-acc text-white text-[11px] font-semibold hover:opacity-90"
              >
                Search
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Add / Paste Custom Lyrics Bar */}
      <AnimatePresence>
        {isAddingLyrics && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleSaveCustomLyrics}
            className="px-2 pb-3 shrink-0 overflow-hidden"
          >
            <div className="p-2.5 rounded-xl bg-black/60 border border-white/15 space-y-2 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white">Add Custom Lyrics</span>
                <span className="text-[10px] text-dim">Supports LRC [mm:ss.xx] or plain lines</span>
              </div>
              <textarea
                value={lyricsInputText}
                onChange={(e) => setLyricsInputText(e.target.value)}
                placeholder="Paste lyrics here...&#10;[00:12.30] First lyric line&#10;[00:18.50] Second lyric line"
                rows={5}
                className="w-full rounded-lg bg-white/5 border border-white/10 p-2 text-[12px] text-white placeholder:text-dim/60 outline-none resize-none font-mono"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingLyrics(false)}
                  className="px-3 py-1 rounded-lg bg-white/10 text-dim text-[11px] font-semibold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 rounded-lg bg-acc text-white text-[11px] font-semibold hover:opacity-90"
                >
                  Save Lyrics
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Main Lyrics Body with Centered Auto-Scroll till song ends */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar px-3 sm:px-6 space-y-7 relative"
        style={{
          // 50vh padding on top and bottom ensures every line can be positioned in the exact vertical middle
          paddingTop: 'calc(50vh - 40px)',
          paddingBottom: 'calc(50vh - 40px)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)',
        }}
      >
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-16">
            <div className="flex items-center gap-1.5 h-8">
              <span className="w-1.5 h-6 rounded-full bg-acc animate-pulse" />
              <span className="w-1.5 h-10 rounded-full bg-acc2 animate-pulse delay-75" />
              <span className="w-1.5 h-4 rounded-full bg-acc animate-pulse delay-150" />
            </div>
            <p className="text-[13px] font-medium text-dim">Fetching lyrics...</p>
          </div>
        ) : !data || data.lines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-16 px-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-dim mb-1">
              <AlignLeft size={22} />
            </div>
            <p className="text-[16px] font-semibold text-main">Lyrics not found</p>
            <p className="text-[12px] text-dim max-w-[280px]">
              We couldn't find live lyrics for "{title}". You can search by song title or add custom lyrics.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setIsSearching(true)}
                className="chip !px-3.5 !py-2 text-[12px] font-medium text-acc hover:bg-acc/10"
              >
                <Search size={13} /> Search title
              </button>
              <button
                onClick={() => {
                  setIsAddingLyrics(true);
                  setLyricsInputText('');
                }}
                className="chip !px-3.5 !py-2 text-[12px] font-medium text-white hover:bg-white/10"
              >
                <Plus size={13} /> Add Lyrics
              </button>
            </div>
          </div>
        ) : (
          data.lines.map((line, idx) => {
            const isActive = data.synced && idx === activeIndex;
            const isPast = data.synced && idx < activeIndex;

            return (
              <div
                key={idx}
                ref={(el) => {
                  lineRefs.current[idx] = el;
                }}
                onClick={() => {
                  if (data.synced && line.time >= 0) {
                    player.seek(line.time);
                    scrollActiveLineToMiddle(idx, true);
                  }
                }}
                className={cx(
                  "transition-all duration-300 text-left rounded-2xl p-2.5 -mx-2.5 select-none",
                  data.synced && "cursor-pointer hover:bg-white/[0.04]",
                  isActive
                    ? "scale-[1.04] origin-left"
                    : isPast
                    ? "opacity-30 hover:opacity-70 blur-[0.2px]"
                    : "opacity-45 hover:opacity-85"
                )}
              >
                <p
                  className={cx(
                    "leading-relaxed transition-all duration-300 font-sans",
                    isActive
                      ? "text-[24px] sm:text-[28px] font-black text-white"
                      : "text-[18px] sm:text-[21px] font-medium text-white/70"
                  )}
                  style={{
                    color: isActive ? '#ffffff' : undefined,
                    textShadow: isActive
                      ? `0 0 25px ${accentColor}, 0 0 50px ${accentColor2}88, 0 4px 15px rgba(0,0,0,0.8)`
                      : undefined,
                  }}
                >
                  {line.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
