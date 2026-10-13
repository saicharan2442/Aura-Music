import { Component, useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, WifiOff } from 'lucide-react';
import type { Page } from './types';
import { useSettings } from './store/settings';
import { useUI } from './store/ui';
import { usePlayer } from './store/player';
import { useLibrary } from './store/library';
import { getTheme, shiftHue, isDarkThemeColor } from './theme-utils';
import { useOnline } from './hooks';

import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { PlayerBar } from './components/PlayerBar';
import { QueuePanel } from './components/QueuePanel';
import { NowPlaying } from './components/NowPlaying';
import { MiniMode } from './components/MiniPlayer';
import { AudioEngine } from './components/AudioEngine';
import { YouTubePlayer } from './components/YouTubePlayer';
import { ContextMenu } from './components/ContextMenu';
import { Modals } from './components/Modals';
import { Toasts } from './components/Toasts';
import { FirstRun } from './components/FirstRun';

import Home from './pages/Home';
import Search from './pages/Search';
import Discover from './pages/Discover';
import Library from './pages/Library';
import Favorites from './pages/Favorites';
import Playlists, { PlaylistPage } from './pages/Playlists';
import Recent from './pages/Recent';
import Settings from './pages/Settings';
import About from './pages/About';
import { AlbumPage, ArtistPage, GenrePage } from './pages/Detail';

/* ------------------------------------------------------------------ */
/*  Theme engine — writes CSS variables to :root                      */
/* ------------------------------------------------------------------ */

function useThemeEngine() {
  const s = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      let theme = getTheme(s.themeId);
      if (s.mode === 'light' && theme.scheme !== 'light') theme = getTheme('light');
      if (s.mode === 'dark' && theme.scheme !== 'dark') theme = getTheme('midnight');
      if (s.mode === 'system') {
        const sysLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        if (theme.scheme !== (sysLight ? 'light' : 'dark')) theme = getTheme(sysLight ? 'light' : 'midnight');
      }
      const v = theme.vars;
      let accent = v.accent;
      let accent2 = v.accent2;
      let onAccent = v.onAccent;
      if (s.customAccent) {
        accent = s.customAccent;
        accent2 = shiftHue(s.customAccent, 34);
        onAccent = isDarkThemeColor(s.customAccent) ? '#ffffff' : '#10101a';
      }
      const set = (k: string, val: string) => root.style.setProperty(k, val);
      set('--bg', v.bg); set('--bg-soft', v.bgSoft); set('--card', v.card); set('--elev', v.elev);
      set('--text', v.text); set('--soft', v.soft); set('--dim', v.dim); set('--border', v.border);
      set('--accent', accent); set('--accent2', accent2); set('--on-accent', onAccent);
      set('--shadow', v.shadow);
      set('--radius', `${s.radius}px`);
      set('--blur', s.glass ? `${s.blur}px` : '0px');
      set('--card-alpha', s.glass ? String(s.cardAlpha) : '1');
      root.dataset.anim = s.animations;
      root.dataset.scheme = theme.scheme;
      root.style.colorScheme = theme.scheme;
    };
    apply();
    if (s.mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const h = () => apply();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [s.themeId, s.mode, s.customAccent, s.radius, s.blur, s.cardAlpha, s.glass, s.animations]);
}

/* ------------------------------------------------------------------ */
/*  Global keyboard shortcuts                                          */
/* ------------------------------------------------------------------ */

function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const p = usePlayer.getState();
      const ui = useUI.getState();

      if (e.key === 'Escape') { ui.closeMenu(); return; }

      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        p.toggle();
        return;
      }

      // submit search on Enter while typing
      if (typing && e.key === 'Enter' && ui.searchQuery.trim()) {
        useLibrary.getState().addSearch(ui.searchQuery);
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) return;
      switch (e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          ui.requestSearchFocus();
          if (ui.page.id !== 'search') ui.go({ id: 'search' });
          break;
        case 'l': {
          e.preventDefault();
          const c = p.current();
          if (c) {
            const on = useLibrary.getState().toggleFavorite(c);
            ui.toast({ title: on ? 'Added to Favorites' : 'Removed from Favorites', sub: c.title, art: c.artworkSmall || c.artwork, kind: on ? 'success' : 'info' });
          }
          break;
        }
        case 'q': e.preventDefault(); ui.setQueueOpen(!ui.queueOpen); break;
        case 'm': e.preventDefault(); p.toggleMute(); break;
        case 'arrowright': e.preventDefault(); p.next(); break;
        case 'arrowleft': e.preventDefault(); p.prev(); break;
        case 'arrowup': e.preventDefault(); p.setVolume(Math.min(1, p.volume + 0.05)); break;
        case 'arrowdown': e.preventDefault(); p.setVolume(Math.max(0, p.volume - 0.05)); break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Error boundary — never show a dead screen                          */
/* ------------------------------------------------------------------ */

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-10">
        <div className="w-16 h-16 rounded-2xl bg-card border border-line flex items-center justify-center text-dim mb-5">
          <RefreshCw size={24} />
        </div>
        <h2 className="display text-main font-semibold text-[20px]">Something went wrong</h2>
        <p className="text-dim text-[13px] mt-2 max-w-[380px]">
          An unexpected error interrupted the groove. Your library and settings are safe.
        </p>
        <div className="flex gap-3 mt-7">
          <button className="btn btn-ghost" onClick={() => { this.setState({ err: null }); useUI.getState().go({ id: 'home' }); }}>
            Go home
          </button>
          <button className="btn btn-accent" onClick={() => window.location.reload()}>Reload Aura</button>
        </div>
      </div>
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Page router                                                        */
/* ------------------------------------------------------------------ */

function renderPage(page: Page) {
  switch (page.id) {
    case 'home': return <Home />;
    case 'search': return <Search />;
    case 'discover': return <Discover />;
    case 'library': return <Library />;
    case 'favorites': return <Favorites />;
    case 'playlists': return <Playlists />;
    case 'playlist': return <PlaylistPage params={page.params ?? {}} />;
    case 'recent': return <Recent />;
    case 'settings': return <Settings />;
    case 'about': return <About />;
    case 'album': return <AlbumPage params={page.params ?? {}} />;
    case 'artist': return <ArtistPage params={page.params ?? {}} />;
    case 'genre': return <GenrePage params={page.params ?? {}} />;
    default: return <Home />;
  }
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  useThemeEngine();
  useShortcuts();

  const page = useUI((s) => s.page);
  const miniMode = useUI((s) => s.miniMode);
  const animations = useSettings((s) => s.animations);
  const online = useOnline();
  const setOnline = useUI((s) => s.setOnline);
  const current = usePlayer((s) => s.current());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOnline(online), [online, setOnline]);

  useEffect(() => {
    document.title = current ? `${current.title} — ${current.artist} · Aura Music` : 'Aura Music — Your Modern Music Experience';
  }, [current]);

  const pageKey = page.id + ':' + JSON.stringify(page.params ?? {});
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [pageKey]);

  const dur = animations === 'full' ? 0.3 : animations === 'reduced' ? 0.15 : 0;

  return (
    <div className="h-full flex flex-col app-bg grain text-main overflow-hidden">
      <AudioEngine />
      <YouTubePlayer />

      {miniMode ? (
        <MiniMode />
      ) : (
        <>
          <TopBar />
          <div className="flex-1 min-h-0 flex">
            <Sidebar />
            <main className="flex-1 min-w-0 flex flex-col relative" id="main">
              {!online && (
                <div className="flex items-center justify-center gap-3 py-2 px-4 text-[12px] font-medium shrink-0"
                  style={{ background: 'color-mix(in srgb, #ff9f43 14%, transparent)', color: '#ffb86b' }}
                  role="status">
                  <WifiOff size={13} />
                  You're offline — streaming is unavailable, but your library still works.
                  <button className="underline underline-offset-2 hover:text-white transition-colors" onClick={() => window.location.reload()}>
                    Retry
                  </button>
                </div>
              )}
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scroll-slim relative" id="scroll-area">
                <ErrorBoundary>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={pageKey}
                      initial={{ opacity: 0, y: dur ? 12 : 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: dur ? -8 : 0 }}
                      transition={{ duration: dur, ease: [0.22, 0.68, 0.24, 1] }}
                      className="min-h-full"
                    >
                      {renderPage(page)}
                    </motion.div>
                  </AnimatePresence>
                </ErrorBoundary>
              </div>
            </main>
          </div>
          <PlayerBar />
        </>
      )}

      {/* global overlays */}
      <NowPlaying />
      <QueuePanel />
      <ContextMenu />
      <Modals />
      <Toasts />
      <FirstRun />
    </div>
  );
}
