import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Moon, Search, Sun, Wifi, WifiOff, X } from 'lucide-react';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { getTheme } from '../themes/themes';
import { cx } from '../utils';
import { Logo } from './Logo';

/* Frame-style top bar: navigation, omnibox search, status actions. */

export function TopBar() {
  const page = useUI((s) => s.page);
  const past = useUI((s) => s.past);
  const future = useUI((s) => s.future);
  const back = useUI((s) => s.back);
  const forward = useUI((s) => s.forward);
  const go = useUI((s) => s.go);
  const query = useUI((s) => s.searchQuery);
  const setQuery = useUI((s) => s.setSearchQuery);
  const searchFocus = useUI((s) => s.searchFocus);
  const online = useUI((s) => s.online);
  const toast = useUI((s) => s.toast);
  const themeId = useSettings((s) => s.themeId);
  const userName = useSettings((s) => s.userName);
  const set = useSettings((s) => s.set);
  const inputRef = useRef<HTMLInputElement>(null);

  const theme = getTheme(themeId);
  const isLight = theme.scheme === 'light';

  useEffect(() => {
    if (searchFocus > 0) inputRef.current?.focus();
  }, [searchFocus]);

  const onSearchChange = (v: string) => {
    setQuery(v);
    if (page.id !== 'search') go({ id: 'search' });
  };

  const quickTheme = () => {
    const next = isLight ? 'midnight' : 'light';
    set({ themeId: next, mode: isLight ? 'dark' : 'light' });
  };

  return (
    <header className="relative z-40 h-[60px] shrink-0 flex items-center gap-3 px-4 border-b border-line glass" role="banner">
      {/* app brand icon */}
      <button
        onClick={() => go({ id: 'home' })}
        className="flex items-center gap-2 rounded-xl p-1 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] transition-all mr-0.5 group shrink-0"
        title="Aura Music Home"
        aria-label="Aura Music Home"
      >
        <Logo size={28} glow />
      </button>

      {/* nav controls */}
      <div className="flex items-center gap-1">
        <button className="icon-btn" onClick={back} disabled={!past.length} aria-label="Back">
          <ChevronLeft size={19} />
        </button>
        <button className="icon-btn" onClick={forward} disabled={!future.length} aria-label="Forward">
          <ChevronRight size={19} />
        </button>
      </div>

      {/* omnibox */}
      <div className="flex-1 max-w-[520px] relative">
        <Search size={15.5} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder="Search songs, artists, albums…"
          aria-label="Search"
          className="input !h-10 !pl-10 !pr-16 !rounded-full !bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border-transparent focus:!border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
        />
        {query ? (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 icon-btn !w-6 !h-6" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={13} />
          </button>
        ) : (
          <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-dim bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-1.5 py-0.5 rounded-md pointer-events-none hidden sm:block">
            Ctrl F
          </kbd>
        )}
      </div>

      <div className="flex-1 flex justify-end mr-3">
        <div 
          className="relative flex items-center h-[32px] rounded-full bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] overflow-hidden w-[240px]"
          style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)' }}
        >
          <motion.div
            className="flex items-center gap-2.5 whitespace-nowrap absolute"
            initial={{ x: 240 }}
            animate={{ x: -280 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          >
            <span className="text-[10px] font-bold text-soft uppercase tracking-[0.25em]">
              Developed by
            </span>
            <span className="text-[12px] font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-[#3fd4ff] via-[#b26bff] to-[#ff5fb0]">
              Saicharan Sada
            </span>
          </motion.div>
        </div>
      </div>

      {/* status + quick actions */}
      <div className="flex items-center gap-1.5">
        <button
          className={cx('icon-btn', !online && 'text-[#ff8580]')}
          title={online ? 'Connected' : "You're offline"}
          aria-label={online ? 'Connected' : 'Offline'}
          onClick={() => toast(online ? { title: 'Connected', sub: 'Streaming services are reachable', kind: 'success' } : { title: "You're offline", sub: 'Streaming requires an internet connection', kind: 'error' })}
        >
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
        </button>
        <button className="icon-btn" onClick={quickTheme} title={isLight ? 'Switch to dark' : 'Switch to light'} aria-label="Toggle light or dark theme">
          {isLight ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {userName ? (
          <button
            onClick={() => go({ id: 'settings' })}
            className="flex items-center gap-2 ml-1 pl-1.5 pr-3 py-1 rounded-full bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] border border-line transition-all group shrink-0"
            title={`Hi ${userName} · Open Settings`}
            aria-label={`User profile: ${userName}`}
          >
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-tr from-[var(--accent)] to-[var(--accent2)] shadow-sm">
              {userName.charAt(0).toUpperCase()}
            </span>
            <span className="text-[12px] font-medium text-soft group-hover:text-main truncate max-w-[100px]">
              {userName}
            </span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
