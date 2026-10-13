import { useRef, useState } from 'react';
import {
  Heart, ListMusic, Maximize2, Mic2, Minimize2, Pause, Play, Repeat, Repeat1,
  Shuffle, SkipBack, SkipForward, Video, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { clamp, cx, fmtTime } from '../utils';
import { Artwork } from './Artwork';
import { usePalette } from '../hooks';
import { useTrackMenu } from './ContextMenu';

/* ---------------- seek bar (exported for Now Playing) ------------- */

export function ProgressBar({ value, max, onSeek, className }: {
  value: number; max: number; onSeek: (v: number) => void; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? (max > 0 ? value / max : 0);

  const ratio = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  };

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); onSeek(Math.min(max, value + 5)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onSeek(Math.max(0, value - 5)); }
      }}
      className={cx('group/bar relative flex items-center h-5 cursor-pointer touch-none select-none', className)}
      onPointerDown={(e) => { ref.current!.setPointerCapture(e.pointerId); setScrub(ratio(e)); }}
      onPointerMove={(e) => { if (scrub != null) setScrub(ratio(e)); }}
      onPointerUp={(e) => { if (scrub != null) { const r = ratio(e); setScrub(null); onSeek(r * max); } }}
      onPointerCancel={() => setScrub(null)}
    >
      <div className="relative w-full h-[5px] rounded-full bg-[color-mix(in_srgb,var(--text)_13%,transparent)] group-hover/bar:h-[6px] transition-all">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${shown * 100}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent2))' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--text)] shadow-md opacity-0 group-hover/bar:opacity-100 transition-opacity"
          style={{ left: `${shown * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ---------------- volume (exported for Now Playing) --------------- */

export function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const shown = muted ? 0 : volume;
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex items-center gap-1">
      <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
        <Icon size={17} />
      </button>
      <input
        type="range"
        aria-label="Volume"
        className="slider w-[88px] hidden md:block"
        min={0} max={1} step={0.01}
        value={shown}
        style={{ '--val': `${shown * 100}%` } as any}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </div>
  );
}

/* ---------------- player bar ---------------- */

const SPEEDS = [1, 1.25, 1.5, 0.75];

export function PlayerBar() {
  const current = usePlayer((s) => s.current());
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const speed = usePlayer((s) => s.speed);
  const fav = useLibrary((s) => (current ? s.favorites.some((f) => f.id === current.id) : false));
  const dynamicColors = useSettings((s) => s.dynamicColors);
  const queueOpen = useUI((s) => s.queueOpen);
  const setQueueOpen = useUI((s) => s.setQueueOpen);
  const setNpOpen = useUI((s) => s.setNpOpen);
  const setMiniMode = useUI((s) => s.setMiniMode);
  const videoMode = useUI((s) => s.videoMode);
  const lyricsMode = useUI((s) => s.lyricsMode);
  const npOpen = useUI((s) => s.npOpen);
  const go = useUI((s) => s.go);
  const menu = useTrackMenu();

  const palette = usePalette(dynamicColors ? current?.artworkSmall : undefined, current?.title ?? 'aura');

  const player = usePlayer.getState();
  const dur = duration || current?.duration || 0;
  const btn = 'icon-btn';

  return (
    <footer
      className="relative z-40 h-[var(--player-h)] shrink-0 glass-strong border-t border-line"
      role="contentinfo"
      aria-label="Player"
    >
      {/* accent glow strip */}
      <div
        className="absolute top-0 inset-x-0 h-px transition-opacity duration-700"
        style={{
          background: palette
            ? `linear-gradient(90deg, transparent, ${palette.a}88 30%, ${palette.b}88 70%, transparent)`
            : 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 40%, transparent), transparent)',
          opacity: current ? 1 : 0.35,
        }}
      />
      {/* ambient palette pool */}
      {current && palette && (
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-700"
          style={{
            background: `radial-gradient(600px 120px at 18% 130%, ${palette.a}26, transparent 70%), radial-gradient(500px 120px at 82% 130%, ${palette.b}1f, transparent 70%)`,
          }}
        />
      )}

      <div className="relative h-full grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 px-4">
        {/* track meta */}
        <div className="flex items-center gap-3 min-w-0">
          {current ? (
            <>
              <button onClick={() => setNpOpen(true)} onContextMenu={(e) => menu(e, current)} className="relative shrink-0 group/art" aria-label="Open Now Playing">
                <Artwork src={current.artworkSmall || current.artwork} seed={current.title} alt="" eager
                  className="w-14 h-14 rounded-xl border border-line transition-transform duration-300 group-hover/art:scale-[1.04]" />
              </button>
              <div className="min-w-0">
                <button onClick={() => setNpOpen(true)} className="block max-w-full text-[13.5px] font-semibold text-main truncate hover:underline underline-offset-2 text-left">
                  {current.title}
                </button>
                <button
                  onClick={() => current.artistId && go({ id: 'artist', params: { id: current.artistId, name: current.artist } })}
                  className="block max-w-full text-[12px] text-dim truncate hover:text-soft text-left"
                >
                  {current.artist}
                </button>
              </div>
              <button
                className={cx(btn, '!w-8 !h-8 shrink-0 ml-1', fav && 'text-acc')}
                aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                onClick={() => useLibrary.getState().toggleFavorite(current)}
              >
                <Heart size={15.5} className={cx(fav && 'fill-current pop')} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 opacity-70">
              <div className="w-14 h-14 rounded-xl border border-dashed border-line flex items-center justify-center text-dim">
                <ListMusic size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-soft">Nothing playing</p>
                <p className="text-[11.5px] text-dim truncate">Pick a track and lose yourself</p>
              </div>
            </div>
          )}
        </div>

        {/* transport + seek */}
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <button className={cx(btn, '!w-9 !h-9', shuffle && 'active')} aria-label="Shuffle" aria-pressed={shuffle}
              onClick={() => player.toggleShuffle()} disabled={!current}>
              <Shuffle size={15.5} />
            </button>
            <button className={btn} aria-label="Previous" onClick={() => player.prev()} disabled={!current}>
              <SkipBack size={18} className="fill-current" />
            </button>
            <button
              className="play-fab !w-11 !h-11 mx-1"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={() => player.toggle()}
              disabled={!current}
            >
              {isPlaying ? <Pause size={17} className="fill-current" /> : <Play size={17} className="fill-current ml-0.5" />}
            </button>
            <button className={btn} aria-label="Next" onClick={() => player.next()} disabled={!current}>
              <SkipForward size={18} className="fill-current" />
            </button>
            <button className={cx(btn, '!w-9 !h-9', repeat !== 'off' && 'active')} aria-label="Repeat" aria-pressed={repeat !== 'off'}
              onClick={() => player.cycleRepeat()} disabled={!current}>
              {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={15.5} />}
            </button>
          </div>
          <div className="w-full max-w-[620px] flex items-center gap-2.5">
            {current?.live ? (
              <>
                <span className="flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.14em] text-[#ff8580] w-9 justify-end">
                  <span className="live-dot !w-1.5 !h-1.5" />LIVE
                </span>
                <div className="live-strip flex-1" aria-hidden />
                <span className="text-[10.5px] text-dim w-9 text-left">radio</span>
              </>
            ) : (
              <>
                <span className="text-[10.5px] tabular-nums text-dim w-9 text-right">{fmtTime(position)}</span>
                <ProgressBar value={position} max={dur} onSeek={(v) => usePlayer.getState().seek(v)} className="flex-1" />
                <span className="text-[10.5px] tabular-nums text-dim w-9">{fmtTime(dur)}</span>
              </>
            )}
          </div>
        </div>

        {/* utilities */}
        <div className="flex items-center justify-end gap-0.5 min-w-0">
          <button
            className={cx('chip !h-8 !px-2.5 tabular-nums', speed !== 1 && 'active')}
            title="Playback speed"
            aria-label="Playback speed"
            onClick={() => {
              const i = SPEEDS.indexOf(speed);
              player.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
            }}
            disabled={!current}
          >
            {speed}×
          </button>
          <button className={cx(btn, queueOpen && 'active')} aria-label="Queue" onClick={() => setQueueOpen(!queueOpen)}>
            <ListMusic size={17} />
          </button>
          <VolumeControl />
          <button className={btn} aria-label="Mini player" title="Mini player" onClick={() => setMiniMode(true)}>
            <Minimize2 size={15.5} />
          </button>
          {(current?.provider === 'youtube' || current?.provider === 'itunes') && (
            <button
              className={cx(btn, videoMode && 'active text-acc')}
              aria-label="Toggle Video Mode"
              title={videoMode ? "Hide Video" : "Watch Video"}
              onClick={() => {
                const vm = !videoMode;
                useUI.getState().setVideoMode(vm);
                if (vm && !useUI.getState().npOpen) {
                  useUI.getState().setNpOpen(true);
                }
              }}
            >
              <Video size={16} />
            </button>
          )}
          <button
            className={cx(btn, lyricsMode && npOpen && 'active text-acc')}
            aria-label="Lyrics"
            title="Lyrics (Live Synced)"
            onClick={() => {
              useUI.getState().setLyricsMode(true);
              useUI.getState().setNpOpen(true);
            }}
            disabled={!current}
          >
            <Mic2 size={16} />
          </button>
          <button className={btn} aria-label="Now Playing" title="Now Playing" onClick={() => setNpOpen(true)} disabled={!current}>
            <Maximize2 size={15.5} />
          </button>
        </div>
      </div>
    </footer>
  );
}
