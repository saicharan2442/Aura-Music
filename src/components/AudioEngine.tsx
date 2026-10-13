import { useCallback, useEffect, useRef } from 'react';
import { usePlayer, type QueueItem } from '../store/player';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';

/* ------------------------------------------------------------------ */
/*  AudioEngine — dual <audio> pipeline with smooth ramps, crossfade, */
/*  media-session integration, error recovery and next-up preloading. */
/* ------------------------------------------------------------------ */

export function AudioEngine() {
  const elA = useRef<HTMLAudioElement>(null);
  const elB = useRef<HTMLAudioElement>(null);
  const active = useRef<0 | 1>(0);
  const lastLoaded = useRef<string | null>(null);
  const rampCancels = useRef(new Map<HTMLAudioElement, () => void>());
  const fading = useRef(false);
  const skipGuard = useRef(0);
  const lastToast = useRef<string | null>(null);
  const lastErr = useRef<string | null>(null);

  const els = (): HTMLAudioElement[] => [elA.current!, elB.current!];
  const activeEl = () => els()[active.current];

  const baseVol = () => {
    const p = usePlayer.getState();
    const norm = useSettings.getState().normalization ? 0.92 : 1;
    return (p.muted ? 0 : p.volume) * norm;
  };

  /* -------- volume ramp helper -------- */
  const rampTo = useCallback((el: HTMLAudioElement, to: number, ms: number, done?: () => void) => {
    rampCancels.current.get(el)?.();
    const volFrom = el.volume;
    const t0 = performance.now();
    let cancelled = false;
    rampCancels.current.set(el, () => { cancelled = true; });
    const step = (now: number) => {
      if (cancelled) return;
      const k = Math.min(1, (now - t0) / ms);
      el.volume = Math.min(1, Math.max(0, volFrom + (to - volFrom) * k));
      if (k < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }, []);

  /* -------- preload the next track on the idle element -------- */
  const preloadNext = useCallback(() => {
    if (!useSettings.getState().preloadNext) return;
    const next = usePlayer.getState().peekNext();
    const idle = els()[1 - active.current];
    if (!idle || !next?.streamUrl || next.provider === 'youtube') return;
    if (idle.dataset.pre === next.qid) return;
    idle.dataset.pre = next.qid;
    idle.preload = 'auto';
    idle.src = next.streamUrl;
  }, []);

  /* -------- crossfade -------- */
  const startCrossfade = useCallback((next: QueueItem) => {
    const from = activeEl();
    const to = els()[1 - active.current];
    const p = usePlayer.getState();
    const cf = Math.min(useSettings.getState().crossfade, Math.max(1, from.duration - from.currentTime));
    fading.current = true;
    to.dataset.pre = next.qid;
    to.src = next.streamUrl!;
    to.currentTime = 0;
    to.playbackRate = p.speed;
    to.volume = 0;
    to.play().catch(() => {});
    rampTo(from, 0, cf * 1000);
    rampTo(to, baseVol(), cf * 1000, () => {
      from.pause();
      from.removeAttribute('src');
      from.load();
      active.current = active.current === 0 ? 1 : 0;
      lastLoaded.current = next.qid;
      fading.current = false;
      usePlayer.getState().advance(true);
      preloadNext();
    });
  }, [preloadNext, rampTo]);

  const current = usePlayer((s) => s.current());
  const currentQid = current?.qid ?? null;
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = usePlayer((s) => s.position);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const speed = usePlayer((s) => s.speed);
  const normalization = useSettings((s) => s.normalization);

  /* -------- load on track change -------- */
  useEffect(() => {
    const el = activeEl();
    if (!el) return;
    if (!currentQid) {
      el.pause();
      el.removeAttribute('src');
      el.load();
      lastLoaded.current = null;
      return;
    }
    if (lastLoaded.current === currentQid) return; // crossfade already prepared it
    lastLoaded.current = currentQid;
    if (current?.provider === 'youtube' || current?.provider === 'itunes') {
      rampTo(el, 0, 250, () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
      });
      return; 
    }
    if (!current?.streamUrl) {
      /* track has no permitted preview — skip forward safely */
      if (skipGuard.current < 4) {
        skipGuard.current += 1;
        const t = window.setTimeout(() => usePlayer.getState().advance(true), 220);
        return () => window.clearTimeout(t);
      }
      useUI.getState().toast({ title: 'No preview available for this track', kind: 'error' });
      usePlayer.getState().setPlaying(false);
      return;
    }
    skipGuard.current = 0;
    el.src = current.streamUrl;
    el.currentTime = 0;
    el.playbackRate = usePlayer.getState().speed;
    el.volume = 0;
    if (usePlayer.getState().isPlaying) {
      el.play().then(() => { errGuard.current = 0; rampTo(el, baseVol(), 220); }).catch(() => {
        useUI.getState().toast({ title: 'Playback was blocked', sub: 'Press play to start listening', kind: 'error' });
        usePlayer.getState().setPlaying(false);
      });
    }
    preloadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQid]);

  /* -------- transport play / pause -------- */
  useEffect(() => {
    const el = activeEl();
    if (!el || !lastLoaded.current || current?.provider === 'youtube' || current?.provider === 'itunes') return;
    if (isPlaying) {
      el.play().then(() => rampTo(el, baseVol(), 200)).catch(() => {});
    } else {
      rampTo(el, 0, 200, () => { if (!usePlayer.getState().isPlaying) el.pause(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  /* -------- volume / mute / speed -------- */
  useEffect(() => {
    const el = activeEl();
    if (!el || fading.current || current?.provider === 'youtube' || current?.provider === 'itunes') return;
    rampTo(el, baseVol(), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted, normalization]);

  useEffect(() => {
    const el = activeEl();
    if (el) el.playbackRate = speed;
  }, [speed]);

  /* -------- external seeks -------- */
  useEffect(() => {
    const el = activeEl();
    if (!el || current?.provider === 'youtube' || current?.provider === 'itunes') return;
    if (Math.abs(el.currentTime - position) > 0.7) el.currentTime = position;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  /* -------- main sync loop -------- */
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = activeEl();
      if (!el || !lastLoaded.current || current?.provider === 'youtube' || current?.provider === 'itunes') return;
      const p = usePlayer.getState();
      if (!p.isPlaying) return;
      const ct = el.currentTime;
      if (Math.abs(ct - p.position) > 0.22) p.setPosition(ct);
      const d = el.duration;
      if (d && isFinite(d) && Math.abs(d - p.duration) > 0.5) p.setDuration(d);
      const cfSetting = useSettings.getState().crossfade;
      if (
        cfSetting > 0 && d && isFinite(d) && d > cfSetting + 2 &&
        d - ct <= cfSetting && d - ct > 0.1 &&
        !fading.current && p.repeat !== 'one'
      ) {
        const next = p.peekNext();
        if (next?.streamUrl && next.provider !== 'youtube' && next.provider !== 'itunes') startCrossfade(next);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [startCrossfade, current?.provider]);

  /* -------- ended / error -------- */
  const onEnded = (idx: 0 | 1) => () => {
    if (idx !== active.current || fading.current) return;
    const p = usePlayer.getState();
    const el = activeEl();
    if (p.repeat === 'one') {
      el.currentTime = 0;
      p.setPosition(0);
      el.play().catch(() => {});
      return;
    }
    p.advance(true);
  };

  const errGuard = useRef(0);

  const onError = (idx: 0 | 1) => () => {
    if (idx !== active.current || fading.current) return;
    const p = usePlayer.getState();
    const qid = p.current()?.qid;
    if (errGuard.current >= 3) {
      p.setPlaying(false);
      useUI.getState().toast({ title: 'Connection trouble', sub: 'Check your internet connection and press play to retry', kind: 'error' });
      return;
    }
    errGuard.current += 1;
    if (qid && lastErr.current !== qid) {
      lastErr.current = qid;
      useUI.getState().toast({ title: 'Playback failed', sub: 'Trying the next track…', kind: 'error' });
    }
    if (p.hasNext()) p.advance(true);
    else p.setPlaying(false);
  };

  /* -------- media session (OS / hardware media keys) -------- */
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album ?? 'Aura Music',
        artwork: current.artwork ? [{ src: current.artwork, sizes: '600x600', type: 'image/jpeg' }] : undefined,
      });
    } catch { /* unsupported */ }
  }, [currentQid, current]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const p = () => usePlayer.getState();
    try {
      navigator.mediaSession.setActionHandler('play', () => p().setPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => p().setPlaying(false));
      navigator.mediaSession.setActionHandler('nexttrack', () => p().next());
      navigator.mediaSession.setActionHandler('previoustrack', () => p().prev());
      navigator.mediaSession.setActionHandler('seekto', (d: any) => { if (d?.seekTime != null) p().seek(d.seekTime); });
    } catch { /* unsupported */ }
    return () => {
      try {
        const ms = navigator.mediaSession as any;
        ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto'].forEach((a) => ms.setActionHandler(a, null));
      } catch { /* noop */ }
    };
  }, []);

  /* -------- now-playing notifications -------- */
  const notify = useSettings((s) => s.notifications);
  useEffect(() => {
    if (!current || notify === 'off') return;
    if (lastToast.current === current.qid) return;
    lastToast.current = current.qid;
    if (notify === 'inapp') {
      useUI.getState().toast({ title: 'Now playing', sub: `${current.title} — ${current.artist}`, art: current.artworkSmall || current.artwork });
    } else if (notify === 'native' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(current.title, { body: `${current.artist}${current.album ? ` · ${current.album}` : ''}`, icon: current.artworkSmall || current.artwork, tag: 'aura-np', silent: true });
      } catch { /* unsupported */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQid, notify]);

  return (
    <>
      <audio className="hidden" ref={elA} preload="auto" onEnded={onEnded(0)} onError={onError(0)} />
      <audio className="hidden" ref={elB} preload="auto" onEnded={onEnded(1)} onError={onError(1)} />
    </>
  );
}
