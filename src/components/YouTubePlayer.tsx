import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Play } from 'lucide-react';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { resolveYoutubeBridgeCandidates } from '../services/youtube';
import { cx } from '../utils';

let ytApiLoaded = false;
let ytApiPromise: Promise<void> | null = null;

function loadYtApi() {
  if (ytApiLoaded) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    (window as any).onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(script);
  });
  return ytApiPromise;
}

export function YouTubePlayer() {
  const [isReady, setIsReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentQidRef = useRef<string | null>(null);
  const candidatesRef = useRef<string[]>([]);
  const candidateIdxRef = useRef<number>(0);

  const current = usePlayer((s) => s.current());
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = usePlayer((s) => s.position);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const isYoutube = current?.provider === 'youtube' || current?.provider === 'itunes';

  const baseVol = () => {
    const norm = useSettings.getState().normalization ? 0.92 : 1;
    return (muted ? 0 : volume) * norm * 100;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (wrapperRef.current?.requestFullscreen) {
        wrapperRef.current.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleUserActivity = () => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
  };

  const seekingUntilRef = useRef<number>(0);

  const loadVid = (vid: string) => {
    if (playerRef.current && currentQidRef.current === current?.qid) {
      try {
        const startSec = Math.max(0, Math.floor(usePlayer.getState().position || 0));
        playerRef.current.loadVideoById({
          videoId: vid,
          startSeconds: startSec,
        });
        if (!muted) playerRef.current.unMute?.();
        playerRef.current.setVolume?.(baseVol());
        if (isPlaying) {
          playerRef.current.playVideo?.();
        } else {
          playerRef.current.pauseVideo?.();
        }
      } catch (e) {
        console.error('Error loading video in YT player:', e);
      }
    }
  };

  useEffect(() => {
    (window as any).__aura_yt_seek = (targetSec: number) => {
      seekingUntilRef.current = performance.now() + 1500;
      (window as any).__aura_yt_time = targetSec;
      if (playerRef.current?.seekTo) {
        playerRef.current.seekTo(targetSec, true);
        if (usePlayer.getState().isPlaying) {
          playerRef.current.playVideo?.();
        }
      }
    };
    return () => {
      delete (window as any).__aura_yt_seek;
    };
  }, []);

  useEffect(() => {
    loadYtApi().then(() => {
      if (!containerRef.current || playerRef.current) return;
      playerRef.current = new (window as any).YT.Player(containerRef.current, {
        height: '100%',
        width: '100%',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: any) => {
            if (!muted) e.target.unMute?.();
            e.target.setVolume(baseVol());
            setIsReady(true);
          },
          onStateChange: (e: any) => {
            const YT = (window as any).YT;
            if (e.data === YT.PlayerState.PLAYING) {
              usePlayer.getState().setPlaying(true);
            } else if (e.data === YT.PlayerState.ENDED) {
              const p = usePlayer.getState();
              if (p.repeat === 'one') {
                e.target.seekTo(0);
                e.target.playVideo();
              } else {
                p.advance(true);
              }
            }
          },
          onError: (e: any) => {
            console.warn('YouTube Player error code:', e?.data);
            if (candidateIdxRef.current + 1 < candidatesRef.current.length) {
              candidateIdxRef.current += 1;
              const nextVid = candidatesRef.current[candidateIdxRef.current];
              console.log('Trying next candidate video:', nextVid);
              loadVid(nextVid);
              return;
            }

            const failFallback = () => {
              const cur = usePlayer.getState().current();
              if (cur?.streamUrl && cur.provider === 'itunes') {
                const el = document.querySelector('audio') as HTMLAudioElement;
                if (el) {
                  el.src = cur.streamUrl;
                  el.currentTime = 0;
                  el.play().catch(() => {});
                  return;
                }
              }
              useUI.getState().toast({ title: 'Playback failed', sub: 'YouTube blocked this stream.', kind: 'error' });
              usePlayer.getState().advance(true);
            };

            const cur = usePlayer.getState().current();
            if (cur && (cur.provider === 'youtube' || cur.provider === 'itunes') && candidatesRef.current.length <= 1) {
              const query = `${cur.title} ${cur.artist}`;
              resolveYoutubeBridgeCandidates(query).then((cands) => {
                const fresh = cands.filter((c) => !candidatesRef.current.includes(c));
                if (fresh.length) {
                  candidatesRef.current = [...candidatesRef.current, ...fresh];
                  candidateIdxRef.current += 1;
                  console.log('Trying fallback candidate:', candidatesRef.current[candidateIdxRef.current]);
                  loadVid(candidatesRef.current[candidateIdxRef.current]);
                  return;
                }
                failFallback();
              }).catch(failFallback);
              return;
            }

            failFallback();
          }
        },
      });
    });
  }, []);

  // Sync track
  useEffect(() => {
    if (!isReady) return;
    if (!isYoutube || !current) {
      if (playerRef.current?.stopVideo) {
         playerRef.current.stopVideo();
         currentQidRef.current = null;
      }
      return;
    }
    
    if (currentQidRef.current !== current.qid) {
      currentQidRef.current = current.qid;

      if (current.provider === 'youtube') {
        const vid = current.id.replace('ytv:', '');
        candidatesRef.current = [vid];
        candidateIdxRef.current = 0;
        loadVid(vid);
      } else if (current.provider === 'itunes') {
        const query = `${current.title} ${current.artist}`;
        resolveYoutubeBridgeCandidates(query).then((cands) => {
          if (currentQidRef.current === current.qid && cands.length) {
            candidatesRef.current = cands;
            candidateIdxRef.current = 0;
            loadVid(cands[0]);
          } else if (currentQidRef.current === current.qid) {
            if (current.streamUrl) {
              const el = document.querySelector('audio') as HTMLAudioElement;
              if (el) {
                el.src = current.streamUrl;
                el.currentTime = 0;
                el.play().catch(() => {});
                return;
              }
            }
            useUI.getState().toast({ title: 'Playback failed', sub: 'Could not find the full track on YouTube.', kind: 'error' });
            usePlayer.getState().advance(true);
          }
        });
      }
    }
  }, [current, isYoutube, isPlaying, isReady]);

  // Sync play/pause
  useEffect(() => {
    if (!isReady || !isYoutube || !playerRef.current?.playVideo) return;
    if (isPlaying) {
      if (!muted) playerRef.current.unMute?.();
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [isPlaying, isYoutube, isReady]);

  // Sync volume
  useEffect(() => {
    if (!playerRef.current?.setVolume) return;
    if (!muted) playerRef.current.unMute?.();
    else playerRef.current.mute?.();
    playerRef.current.setVolume(baseVol());
  }, [volume, muted]);

  // Sync seek
  useEffect(() => {
    if (!isYoutube || !playerRef.current?.getCurrentTime) return;
    if (performance.now() < seekingUntilRef.current) return;
    const ct = playerRef.current.getCurrentTime() || 0;
    if (Math.abs(ct - position) > 1.2) {
      playerRef.current.seekTo(position, true);
    }
  }, [position, isYoutube]);

  const videoMode = useUI((s) => s.videoMode);
  const npOpen = useUI((s) => s.npOpen);
  const showVideo = videoMode && npOpen && isYoutube;
  const [slotRect, setSlotRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!showVideo) {
      setSlotRect(null);
      return;
    }
    const updateRect = () => {
      const el = document.getElementById('aura-yt-slot');
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setSlotRect(r);
        }
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    const interval = setInterval(updateRect, 250);
    return () => {
      window.removeEventListener('resize', updateRect);
      clearInterval(interval);
    };
  }, [showVideo]);

  useEffect(() => {
    if (!showVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showVideo, isFullscreen]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!isYoutube || !playerRef.current?.getCurrentTime) return;
      if (performance.now() < seekingUntilRef.current) return;
      const ct = playerRef.current.getCurrentTime() || 0;
      (window as any).__aura_yt_time = ct;
      if (!isPlaying) return;
      const dur = playerRef.current.getDuration() || 0;
      const p = usePlayer.getState();
      if (Math.abs(ct - p.position) > 0.4) p.setPosition(ct);
      if (dur > 0 && Math.abs(dur - p.duration) > 0.5) p.setDuration(dur);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isYoutube, isPlaying]);

  let wrapperStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    right: 0,
    width: 200,
    height: 200,
    opacity: 0.001,
    pointerEvents: 'none',
    zIndex: -50,
  };

  if (showVideo) {
    if (isFullscreen) {
      wrapperStyle = {
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 100,
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        margin: 0,
        pointerEvents: 'auto',
      };
    } else if (slotRect) {
      wrapperStyle = {
        position: 'fixed',
        left: slotRect.left,
        top: slotRect.top,
        width: slotRect.width,
        height: slotRect.height,
        zIndex: 85,
        backgroundColor: '#000',
        borderRadius: 24,
        overflow: 'hidden',
        pointerEvents: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
      };
    } else {
      wrapperStyle = {
        position: 'fixed',
        left: '50%',
        top: '42%',
        transform: 'translate(-50%, -50%)',
        width: 'min(90vw, calc((100vh - 280px) * 16 / 9))',
        maxHeight: 'calc(100vh - 280px)',
        aspectRatio: '16/9',
        zIndex: 85,
        backgroundColor: '#000',
        borderRadius: 24,
        overflow: 'hidden',
        pointerEvents: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
      };
    }
  }

  return (
    <div 
      ref={wrapperRef}
      style={wrapperStyle}
      className={cx(
        "overflow-hidden select-none transition-all duration-200",
        !showVideo && "pointer-events-none"
      )}
      aria-hidden={!showVideo}
      onMouseMove={showVideo ? handleUserActivity : undefined}
      onClick={showVideo ? handleUserActivity : undefined}
    >
      {/* video element container - auto scales proportionally */}
      <div 
        className="w-full h-full flex items-center justify-center yt-video-wrapper overflow-hidden select-none cursor-pointer"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          usePlayer.getState().toggle();
        }}
        onDoubleClick={toggleFullscreen}
      >
        <div ref={containerRef} className="w-full h-full pointer-events-none select-none" />
      </div>

      {/* Sleek custom pause overlay that hides any YouTube pause graphics */}
      {showVideo && !isPlaying && (
        <div 
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px] transition-all duration-300 pointer-events-none"
        >
          <div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl">
            <Play size={28} className="fill-current ml-1" />
          </div>
        </div>
      )}

      {/* ONLY fullscreen button - icon only, no text, no watermarks */}
      {showVideo && (
        <div 
          className={cx(
            "absolute transition-opacity duration-200 pointer-events-auto z-20",
            isFullscreen ? "top-4 right-4" : "top-3 right-3",
            showControls ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <button
            onClick={toggleFullscreen}
            className={cx(
              "rounded-xl bg-black/60 hover:bg-black/85 text-white/90 hover:text-white border border-white/20 backdrop-blur-md shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center",
              isFullscreen ? "p-3 rounded-2xl" : "p-2.5"
            )}
            title={isFullscreen ? "Exit Fullscreen (F)" : "Full Screen (F)"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Full Screen"}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={16} />}
          </button>
        </div>
      )}
    </div>
  );
}

