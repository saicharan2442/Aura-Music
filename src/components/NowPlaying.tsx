import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronRight, Heart, ListMusic, ListPlus, Mic2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Sparkles, Video, Zap
} from 'lucide-react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { usePalette } from '../hooks';
import { clamp, cx, fmtTime } from '../utils';
import { Artwork } from './Artwork';
import { ProgressBar } from './PlayerBar';
import { LyricsView } from './LyricsView';
import { getHeuristicBpm, detectAcousticBpm, type BeatAnalysis } from '../services/beatDetector';

/* Full-screen Now Playing with artwork-reactive ambient background & embedded video player. */

export function NowPlaying() {
  const open = useUI((s) => s.npOpen);
  return (
    <div
      className={cx(
        "fixed inset-0 z-[80] overflow-hidden grain transition-transform duration-300 ease-out",
        open ? "translate-y-0 pointer-events-auto" : "translate-y-full pointer-events-none"
      )}
      role="dialog"
      aria-label="Now playing"
      aria-hidden={!open}
    >
      <NowPlayingInner />
    </div>
  );
}

function getPreciseAudioTime(): number {
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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

function NowPlayingInner() {
  const setOpen = useUI((s) => s.setNpOpen);
  const setQueueOpen = useUI((s) => s.setQueueOpen);
  const go = useUI((s) => s.go);
  const openModal = useUI((s) => s.openModal);
  const current = usePlayer((s) => s.current());
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const fav = useLibrary((s) => (current ? s.favorites.some((f) => f.id === current.id) : false));
  const next = usePlayer((s) => s.peekNext());
  const videoMode = useUI((s) => s.videoMode);
  const lyricsMode = useUI((s) => s.lyricsMode);
  const setLyricsMode = useUI((s) => s.setLyricsMode);

  const palette = usePalette(current?.artwork, current?.title ?? 'aura');
  const player = usePlayer.getState();

  const isYoutube = current?.provider === 'youtube' || current?.provider === 'itunes';
  const showVideo = videoMode && isYoutube;

  const [beatInfo, setBeatInfo] = useState<BeatAnalysis>(() =>
    getHeuristicBpm(current?.title, current?.artist)
  );
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const phaseOffsetRef = useRef<number>(beatInfo.offset);
  const tapHistoryRef = useRef<number[]>([]);

  // Automatically update beat when song changes
  useEffect(() => {
    if (!current) return;
    const initial = getHeuristicBpm(current.title, current.artist);
    setBeatInfo(initial);
    phaseOffsetRef.current = initial.offset;

    detectAcousticBpm(current.title, current.artist).then((detected) => {
      if (detected && detected.bpm !== initial.bpm) {
        setBeatInfo(detected);
        phaseOffsetRef.current = detected.offset;
      }
    });
  }, [current?.id, current?.title, current?.artist]);

  const isSplit = lyricsMode && !showVideo;
  const artSize = isSplit
    ? clamp(Math.round(window.innerHeight * 0.27), 160, 230)
    : clamp(Math.round(window.innerHeight * 0.33), 210, 310);
  const canvasSize = artSize + 150;

  const artDiscRef = useRef<HTMLDivElement>(null);
  const artGlowRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);

  // Instant Disc Tap to align phase and measure tap tempo
  const handleDiscTap = () => {
    const now = performance.now();
    const livePos = getPreciseAudioTime();
    const beatSec = 60 / beatInfo.bpm;

    // Snap phase offset so the beat peaks immediately
    phaseOffsetRef.current = livePos % beatSec;

    // Track taps for multi-tap BPM refinement
    const taps = tapHistoryRef.current.filter((t) => now - t < 1800);
    taps.push(now);
    tapHistoryRef.current = taps;

    let currentBpm = beatInfo.bpm;
    if (taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push((taps[i] - taps[i - 1]) / 1000);
      }
      const avgSec = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calcBpm = Math.round(60 / avgSec);
      if (calcBpm >= 60 && calcBpm <= 200) {
        currentBpm = calcBpm;
        setBeatInfo({ bpm: calcBpm, offset: livePos % (60 / calcBpm), source: 'tap' });
      }
    }

    setSyncToast(`⚡ Beat Synced • ${currentBpm} BPM`);
    setTimeout(() => setSyncToast(null), 1800);
  };

  useEffect(() => {
    if (!isPlaying || showVideo) {
      if (artDiscRef.current) artDiscRef.current.style.transform = 'scale(1)';
      if (artGlowRef.current) {
        artGlowRef.current.style.transform = 'scale(1)';
        artGlowRef.current.style.opacity = '0.55';
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const beatDuration = 60 / beatInfo.bpm;
    let raf = 0;
    let lastAnchorPos = getPreciseAudioTime();
    let lastAnchorTime = performance.now();
    let lastBeatIndex = -1;

    const tick = (now: number) => {
      const curLivePos = getPreciseAudioTime();

      // Keep continuous high-resolution audio clock aligned with player
      if (Math.abs(curLivePos - (lastAnchorPos + (now - lastAnchorTime) / 1000)) > 0.3) {
        lastAnchorPos = curLivePos;
        lastAnchorTime = now;
      }

      const elapsed = (now - lastAnchorTime) / 1000;
      const smoothPos = Math.max(0, lastAnchorPos + elapsed - phaseOffsetRef.current);

      const beatNumber = smoothPos / beatDuration;
      const beatFraction = beatNumber % 1;
      const currentBeatFloor = Math.floor(beatNumber);
      const measureBeat = currentBeatFloor % 4;

      // Downbeats 0 & 2 have max punch, beats 1 & 3 have solid kick response
      const beatWeight = (measureBeat === 0) ? 1.0 : (measureBeat === 2) ? 0.92 : 0.82;

      // Punchy attack (instant punch on hit) + exponential subwoofer elastic decay
      const attack = Math.min(1, beatFraction / 0.05);
      const decay = Math.exp(-beatFraction * 7.5);
      const intensity = attack * decay * beatWeight;

      // Elastic zoom-in zoom-out bounce equation (like real subwoofer cone throw)
      const bounce = Math.sin(beatFraction * Math.PI * 2) * Math.exp(-beatFraction * 4.5);
      const scaleVal = 1.0 + intensity * 0.125 + bounce * 0.022;

      // High-frequency bass rumble vibration on the strike
      let shakeX = 0;
      let shakeY = 0;
      if (intensity > 0.6) {
        const shakeMag = (intensity - 0.6) * 3.5;
        shakeX = Math.sin(now * 0.05) * shakeMag;
        shakeY = Math.cos(now * 0.07) * shakeMag;
      }

      // 1. Center Artwork Zoom In / Zoom Out Speaker Punch
      if (artDiscRef.current) {
        artDiscRef.current.style.transform = `scale(${scaleVal}) translate(${shakeX}px, ${shakeY}px)`;
      }

      // 2. Ambient Color Glow Pulse Behind Artwork
      if (artGlowRef.current) {
        const glowScale = 1.05 + intensity * 0.22;
        const glowOpacity = 0.55 + intensity * 0.45;
        artGlowRef.current.style.transform = `scale(${glowScale})`;
        artGlowRef.current.style.opacity = `${glowOpacity}`;
      }

      // 3. Trigger Bass Particles on every new beat hit
      if (currentBeatFloor !== lastBeatIndex) {
        lastBeatIndex = currentBeatFloor;
        const colA = palette?.a ?? '#a855f7';
        const colB = palette?.b ?? '#3b82f6';
        const count = measureBeat === 0 ? 12 : 7;
        const baseR = artSize / 2 + 10;
        const center = canvasSize / 2;

        for (let k = 0; k < count; k++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.2 + Math.random() * 2.8;
          particlesRef.current.push({
            x: center + Math.cos(angle) * baseR,
            y: center + Math.sin(angle) * baseR,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            maxLife: 1.0,
            size: 2 + Math.random() * 3,
            color: Math.random() > 0.5 ? colA : colB,
          });
        }
      }

      // 4. Render Radial Wave Creator on Canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const cxCenter = canvas.width / 2;
          const cyCenter = canvas.height / 2;
          const R0 = (artSize / 2) + 3; // base inner radius touching album disc rim

          const colA = palette?.a ?? '#a855f7';
          const colB = palette?.b ?? '#3b82f6';

          // A. Draw Expanding Concentric Audio Shockwaves
          const ring1Progress = beatFraction;
          const ring2Progress = (beatFraction + 0.45) % 1;

          ctx.lineWidth = 1.8;
          // Shockwave 1
          const r1 = R0 + ring1Progress * 54;
          const alpha1 = Math.max(0, (1 - ring1Progress) * 0.7 * (0.4 + intensity * 0.6));
          ctx.strokeStyle = colA;
          ctx.globalAlpha = alpha1;
          ctx.beginPath();
          ctx.arc(cxCenter, cyCenter, r1, 0, Math.PI * 2);
          ctx.stroke();

          // Shockwave 2
          const r2 = R0 + ring2Progress * 70;
          const alpha2 = Math.max(0, (1 - ring2Progress) * 0.45);
          ctx.strokeStyle = colB;
          ctx.globalAlpha = alpha2;
          ctx.beginPath();
          ctx.arc(cxCenter, cyCenter, r2, 0, Math.PI * 2);
          ctx.stroke();

          ctx.globalAlpha = 1.0;

          // B. Draw 64 Radial Sound Wave Bars (YouTube Avee Player / Trap Nation style)
          const barCount = 64;
          const crestPoints: { x: number; y: number }[] = [];

          for (let i = 0; i < barCount; i++) {
            const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;

            // Mirror left and right channels symmetrically around the circle
            const normIdx = i <= barCount / 2 ? i / (barCount / 2) : (barCount - i) / (barCount / 2);

            // Bass frequencies concentrated in bottom/flanks, mids & treble around circle
            const bassWeight = Math.pow(1 - normIdx, 1.6);
            const bassPeak = bassWeight * intensity * 48;

            // Traveling sound wave harmonics
            const wave1 = Math.sin(smoothPos * 16 + i * 0.4) * 0.5 + 0.5;
            const wave2 = Math.cos(smoothPos * 26 + i * 0.8) * 0.5 + 0.5;
            const harmonicHeight = (wave1 * 12 + wave2 * 8) * (0.35 + intensity * 0.65);

            // Rapid percussive hi-hat/transient flutter
            const flutter = Math.sin(now * 0.03 + i * 1.4) * 3.5 * (0.4 + intensity * 0.6);

            const barLen = Math.max(4, bassPeak + harmonicHeight + flutter);

            const xIn = cxCenter + Math.cos(angle) * R0;
            const yIn = cyCenter + Math.sin(angle) * R0;
            const xOut = cxCenter + Math.cos(angle) * (R0 + barLen);
            const yOut = cyCenter + Math.sin(angle) * (R0 + barLen);

            crestPoints.push({ x: xOut, y: yOut });

            // Draw radial bar
            const grad = ctx.createLinearGradient(xIn, yIn, xOut, yOut);
            grad.addColorStop(0, colA);
            grad.addColorStop(0.7, colB);
            grad.addColorStop(1, '#ffffff');

            ctx.beginPath();
            ctx.moveTo(xIn, yIn);
            ctx.lineTo(xOut, yOut);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.shadowColor = colA;
            ctx.shadowBlur = intensity > 0.5 ? 12 : 5;
            ctx.stroke();
          }

          // C. Draw Smooth Fluid Wave Crest Spline linking bar tips
          if (crestPoints.length > 2) {
            ctx.beginPath();
            ctx.moveTo(crestPoints[0].x, crestPoints[0].y);
            for (let i = 0; i < crestPoints.length; i++) {
              const curr = crestPoints[i];
              const next = crestPoints[(i + 1) % crestPoints.length];
              const midX = (curr.x + next.x) / 2;
              const midY = (curr.y + next.y) / 2;
              ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
            }
            ctx.closePath();
            ctx.strokeStyle = colB;
            ctx.globalAlpha = 0.45 + intensity * 0.45;
            ctx.lineWidth = 1.6;
            ctx.shadowColor = colB;
            ctx.shadowBlur = 10;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }

          // D. Draw & Update Bass Particle Sparks
          ctx.shadowBlur = 0;
          for (let pIdx = particlesRef.current.length - 1; pIdx >= 0; pIdx--) {
            const p = particlesRef.current[pIdx];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.024;
            if (p.life <= 0) {
              particlesRef.current.splice(pIdx, 1);
              continue;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life * 0.85;
            ctx.fill();
          }
          ctx.globalAlpha = 1.0;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, showVideo, beatInfo.bpm, artSize, canvasSize, palette]);

  useEffect(() => {
    if (!current) setOpen(false);
  }, [current, setOpen]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useUI.getState().npOpen) setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setOpen]);

  if (!current) {
    return null;
  }

  const dur = duration || current.duration || 0;
  const a = palette?.a ?? 'var(--accent)';
  const b = palette?.b ?? 'var(--accent2)';

  // Shared reusable blocks for single and split mode
  const artworkBlock = (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.05 }}
      className="relative shrink-0 my-auto select-none flex items-center justify-center"
      style={{ width: canvasSize, height: canvasSize }}
    >
      {/* Dynamic ambient color glow cast behind album art with live beat pulse */}
      <div 
        ref={artGlowRef}
        className="absolute inset-16 -z-10 rounded-full blur-3xl opacity-60 transition-[opacity,transform] duration-75 pointer-events-none"
        style={{ 
          background: `radial-gradient(circle, ${a} 0%, ${b} 65%, transparent 100%)`,
        }} 
      />

      {/* 360-degree Radial Wave Creator Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        className="absolute inset-0 pointer-events-none z-0"
      />

      {/* Central Pulsing Artwork Disc (Vibrates and Zooms In/Out with the Bass Beat) */}
      <div
        ref={artDiscRef}
        onClick={handleDiscTap}
        className="relative z-10 rounded-full overflow-hidden ring-4 ring-white/20 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9),0_0_35px_rgba(255,255,255,0.1)] transition-transform duration-75 cursor-pointer active:scale-95 group/disc"
        style={{ width: artSize, height: artSize }}
        title="Click or tap to snap visualizer to the beat"
      >
        <Artwork
          src={current.artwork}
          seed={current.title + current.artist}
          alt={current.title}
          eager
          className="w-full h-full object-cover"
        />
        {/* Vinyl / Speaker cone metallic rim overlay */}
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/15 pointer-events-none" />
      </div>

      {/* Instant Beat Sync Feedback Toast */}
      <AnimatePresence>
        {syncToast && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            className="absolute -bottom-7 z-20 px-3.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-acc shadow-2xl flex items-center gap-1.5 pointer-events-none"
          >
            <Zap size={11} className="fill-current text-acc" />
            {syncToast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const titlesBlock = (
    <div className="text-center w-full px-2 -mt-0.5">
      <h1 className="display text-main font-bold text-[21px] sm:text-[23px] leading-tight truncate">{current.title}</h1>
      <button
        className="text-soft hover:text-acc text-[13.5px] sm:text-[14.5px] font-medium mt-0.5 transition-colors"
        onClick={() => { if (current.artistId) { setOpen(false); go({ id: 'artist', params: { id: current.artistId, name: current.artist } }); } }}
      >
        {current.artist}
      </button>
    </div>
  );

  const seekBlock = (
    <div className="w-full px-1">
      {current.live ? (
        <>
          <div className="live-strip w-full" aria-hidden />
          <div className="flex justify-center mt-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-[#ff8580]">
              <span className="live-dot !w-1.5 !h-1.5" /> LIVE RADIO
            </span>
          </div>
        </>
      ) : (
        <>
          <ProgressBar value={position} max={dur} onSeek={(v) => player.seek(v)} className="w-full" />
          <div className="flex justify-between mt-0.5">
            <span className="text-[11px] tabular-nums text-dim">{fmtTime(position)}</span>
            <span className="text-[11px] tabular-nums text-dim">-{fmtTime(Math.max(0, dur - position))}</span>
          </div>
        </>
      )}
    </div>
  );

  const controlsBlock = (
    <div className="flex items-center gap-3">
      <button className={cx('icon-btn', shuffle && 'active')} aria-label="Shuffle" aria-pressed={shuffle}
        onClick={() => player.toggleShuffle()}>
        <Shuffle size={17} />
      </button>
      <button className="icon-btn !w-11 !h-11" aria-label="Previous" onClick={() => player.prev()}>
        <SkipBack size={22} className="fill-current" />
      </button>
      <button className="play-fab !w-[60px] !h-[60px] mx-1.5" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => player.toggle()}>
        {isPlaying ? <Pause size={23} className="fill-current" /> : <Play size={23} className="fill-current ml-1" />}
      </button>
      <button className="icon-btn !w-11 !h-11" aria-label="Next" onClick={() => player.next()}>
        <SkipForward size={22} className="fill-current" />
      </button>
      <button className={cx('icon-btn', repeat !== 'off' && 'active')} aria-label="Repeat" aria-pressed={repeat !== 'off'}
        onClick={() => player.cycleRepeat()}>
        {repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={16} />}
      </button>
    </div>
  );

  const utilitiesBlock = (
    <div className="flex items-center gap-2 pb-0.5">
      <button
        className={cx('chip', fav && 'active')}
        onClick={() => useLibrary.getState().toggleFavorite(current)}
      >
        <Heart size={13.5} className={cx(fav && 'fill-current')} />
        {fav ? 'Favorited' : 'Favorite'}
      </button>
      <button
        className={cx('chip', lyricsMode && 'active text-acc')}
        onClick={() => {
          if (videoMode) useUI.getState().setVideoMode(false);
          setLyricsMode(!lyricsMode);
        }}
        title={lyricsMode ? "Switch to single view" : "View lyrics on right side"}
      >
        <Mic2 size={13.5} />
        Lyrics
      </button>
      <button className="chip" onClick={() => openModal({ type: 'addToPlaylist', payload: { track: current } })}>
        <ListPlus size={13.5} />
        Playlist
      </button>
      {isYoutube && (
        <button
          className={cx('chip', videoMode && 'active text-acc')}
          onClick={() => {
            if (lyricsMode) setLyricsMode(false);
            useUI.getState().setVideoMode(!videoMode);
          }}
          title={videoMode ? "Switch to album artwork" : "Switch to video"}
        >
          <Video size={13.5} />
          Video
        </button>
      )}
    </div>
  );

  const upNextBlock = next ? (
    <button
      onClick={() => setQueueOpen(true)}
      className="group/upnext w-full flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] text-left backdrop-blur-xl"
      style={{
        boxShadow: `0 12px 32px -8px rgba(0,0,0,0.4), 0 0 24px -12px ${a}33`,
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="relative shrink-0">
          <Artwork 
            src={next.artworkSmall || next.artwork} 
            seed={next.title} 
            alt="" 
            className="w-9 h-9 rounded-xl shadow-md ring-1 ring-white/15 object-cover transition-transform duration-300 group-hover/upnext:scale-105" 
          />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-acc opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-acc shadow-sm" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="flex items-center gap-1 text-[9px] font-bold tracking-[0.2em] uppercase text-acc">
              <Sparkles size={9} className="fill-current" /> Up Next
            </span>
          </div>
          <p className="text-[12px] font-semibold text-main truncate group-hover/upnext:text-acc transition-colors leading-tight">
            {next.title}
          </p>
          <p className="text-[10.5px] text-dim truncate mt-0.5 leading-tight">
            {next.artist}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 pl-2 text-dim group-hover/upnext:text-soft text-[11px] font-medium shrink-0 transition-colors">
        <span className="hidden sm:inline">Queue</span>
        <ChevronRight size={14} className="group-hover/upnext:translate-x-0.5 transition-transform text-acc" />
      </div>
    </button>
  ) : null;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ambient background */}
      <div className="absolute inset-0 bg-base" />
      <div className="absolute inset-[-10%] blur-[100px] opacity-70 transition-all duration-1000"
        style={{
          background: `radial-gradient(48% 44% at 24% 18%, ${a}59, transparent 70%), radial-gradient(52% 48% at 78% 84%, ${b}4d, transparent 72%), radial-gradient(38% 34% at 62% 10%, ${b}26, transparent 70%)`,
        }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg) 18%, transparent), color-mix(in srgb, var(--bg) 72%, transparent) 78%)' }} />

      <div className={cx(
        "relative h-full flex flex-col mx-auto px-5 sm:px-6 transition-all duration-300",
        isSplit ? "max-w-[1360px] w-full" : "max-w-[640px]"
      )}>
        {/* header */}
        <div className="flex items-center justify-between pt-3 pb-1 shrink-0">
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close now playing">
            <ChevronDown size={20} />
          </button>
          <div className="text-center min-w-0">
            <p className="text-[10.5px] font-bold tracking-[0.24em] uppercase text-dim">Now playing</p>
            {current.album && <p className="text-[11.5px] text-soft truncate mt-0.5 max-w-[320px]">{current.album}</p>}
          </div>
          <button className="icon-btn" onClick={() => setQueueOpen(true)} aria-label="Open queue">
            <ListMusic size={17} />
          </button>
        </div>

        {/* Content View: Split Side-by-Side (Left: Player, Right: Lyrics) OR Standard Single Column */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center overflow-hidden py-2">
          {/* Left Side: Artwork/Video & Player Controls */}
          <div className={cx(
            "h-full flex flex-col items-center justify-center overflow-y-auto no-scrollbar mx-auto w-full py-1",
            isSplit ? "lg:col-span-5 gap-2.5 max-w-[460px]" : "lg:col-span-12 gap-3.5 max-w-[640px]"
          )}>
            {!showVideo && artworkBlock}
            {showVideo && (
              <div
                id="aura-yt-slot"
                className="w-full max-w-[min(100%,calc((100vh-280px)*16/9))] max-h-[calc(100vh-280px)] aspect-video rounded-2xl md:rounded-3xl shrink-0 mx-auto my-auto"
              />
            )}
            {titlesBlock}
            {seekBlock}
            {controlsBlock}
            {utilitiesBlock}
            {upNextBlock}
          </div>

          {/* Right Side: Lyrics View with Center Auto-Scroll */}
          {isSplit && (
            <div className="lg:col-span-7 h-full flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 lg:pl-8 overflow-hidden min-h-[380px]">
              <LyricsView
                title={current.title}
                artist={current.artist}
                accentColor={a}
                accentColor2={b}
                onClose={() => setLyricsMode(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
