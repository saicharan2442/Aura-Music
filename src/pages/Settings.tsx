import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Check, Globe, HardDrive, Keyboard, Monitor, Moon, Music2, Palette, Shield, Sun, Trash2, User,
} from 'lucide-react';
import { useLibrary } from '../store/library';
import { useSettings, type AudioQuality, type ProviderPref } from '../store/settings';
import { useUI } from '../store/ui';
import { activeProviderName, getProviders } from '../services/providers';
import type { AnimLevel, NotifyMode, ThemeMode } from '../types';
import { THEMES } from '../themes/themes';
import { cx, storageSize } from '../utils';
import { Kbd, Segmented, SettingRow, SliderRow, Toggle } from '../components/ui';
import { ThemePreview } from '../components/FirstRun';

const ACCENTS = ['#7c6cff', '#3fd4ff', '#22e37b', '#ff7a59', '#ff5fb0', '#f5c542', '#b26bff', '#e8e3d9'];

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['Ctrl + →', 'Next track'],
  ['Ctrl + ←', 'Previous track'],
  ['Ctrl + ↑ / ↓', 'Volume up / down'],
  ['Ctrl + F', 'Focus search'],
  ['Ctrl + L', 'Favorite current track'],
  ['Ctrl + Q', 'Toggle queue'],
  ['Ctrl + M', 'Mute / unmute'],
  ['Esc', 'Close panels & dialogs'],
];

function Section({ id, icon: Icon, title, sub, children }: { id: string; icon: any; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--accent) 13%, transparent)', color: 'var(--accent)' }}>
          <Icon size={16} />
        </span>
        <div>
          <h2 className="display text-main font-semibold text-[17px]">{title}</h2>
          <p className="text-dim text-[12px]">{sub}</p>
        </div>
      </div>
      <div className="card px-5 mt-4">{children}</div>
    </section>
  );
}

export default function Settings() {
  const s = useSettings();
  const toast = useUI((s2) => s2.toast);
  const library = useLibrary();
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (document.getElementById('gsi-client')) return;
    const script = document.createElement('script');
    script.id = 'gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  const pickNative = async () => {
    if (!('Notification' in window)) {
      toast({ title: 'Not supported here', sub: 'Native notifications need the desktop build or a supporting browser', kind: 'error' });
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      s.set({ notifications: 'native' });
      toast({ title: 'Native notifications on', kind: 'success' });
    } else {
      toast({ title: 'Permission denied', sub: 'Staying with in-app notifications', kind: 'error' });
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto px-5 md:px-9 pt-7 pb-16">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="display text-main font-bold text-[30px] tracking-tight">Settings</h1>
        <p className="text-dim text-[13px] mt-1.5">Tune Aura to your taste — everything applies instantly and persists locally.</p>
      </motion.div>

      <div className="flex gap-10 mt-9 items-start">
        {/* section nav */}
        <nav className="hidden lg:block sticky top-8 w-[190px] shrink-0 space-y-1 text-[13px]">
          {[
            ['profile', User, 'Profile'],
            ['appearance', Palette, 'Appearance'],
            ['network', Globe, 'Network & sources'],
            ['audio', Music2, 'Playback & audio'],
            ['notifications', Bell, 'Notifications'],
            ['shortcuts', Keyboard, 'Keyboard'],
            ['storage', HardDrive, 'Storage & privacy'],
          ].map(([id, Icon, label]: any) => (
            <a key={id} href={`#${id}`} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-soft hover:text-main hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors">
              <Icon size={14} /> {label}
            </a>
          ))}
        </nav>

        <div className="flex-1 min-w-0 space-y-12">
          {/* ================= profile ================= */}
          <Section id="profile" icon={User} title="Profile" sub="Your Aura identity and personalized greeting">
            <SettingRow title="Your name" sub="Displayed before the greeting message on the Home page" first>
              <input
                type="text"
                placeholder="Enter your name…"
                value={s.userName}
                onChange={(e) => s.set({ userName: e.target.value })}
                className="input !h-9 !w-[220px] !text-[13px] !rounded-lg"
                maxLength={32}
              />
            </SettingRow>
          </Section>

          {/* ================= appearance ================= */}
          <Section id="appearance" icon={Palette} title="Appearance" sub="Theme, accent and material">
            <SettingRow title="Color mode" sub="System follows your Windows appearance setting" first>
              <Segmented<ThemeMode>
                options={[
                  { value: 'dark', label: 'Dark', icon: Moon },
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'system', label: 'System', icon: Monitor },
                ]}
                value={s.mode}
                onChange={(mode) => s.set({ mode })}
              />
            </SettingRow>

            <div className="py-5 border-t border-line">
              <p className="text-main text-[14px] font-medium">Theme</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 mt-4">
                {THEMES.filter((t) => s.mode === 'system' ? true : t.scheme === (s.mode === 'light' ? 'light' : 'dark')).map((t) => (
                  <ThemePreview key={t.id} id={t.id} active={s.themeId === t.id} onPick={() => s.set({ themeId: t.id, ...(s.mode !== 'system' ? { mode: t.scheme } : {}) })} />
                ))}
              </div>
            </div>

            <div className="py-5 border-t border-line">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-main text-[14px] font-medium">Accent color</p>
                  <p className="text-dim text-[12.5px] mt-0.5">Overrides the theme accent everywhere</p>
                </div>
                <label className="relative w-8 h-8 rounded-full overflow-hidden cursor-pointer border-2 border-line hover:scale-110 transition-transform" title="Pick a custom color"
                  style={{ background: 'conic-gradient(#ff5f5f, #ffb84d, #4de88a, #4dc8ff, #b26bff, #ff5f5f)' }}>
                  <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={s.customAccent ?? '#7c6cff'}
                    onChange={(e) => s.set({ customAccent: e.target.value })} aria-label="Custom accent color" />
                </label>
              </div>
              <div className="flex items-center gap-2.5 mt-4 flex-wrap">
                <button onClick={() => s.set({ customAccent: null })}
                  className={cx('chip !h-8', s.customAccent === null && 'active')}>
                  <Check size={12} className={s.customAccent === null ? '' : 'opacity-0'} /> Theme default
                </button>
                {ACCENTS.map((c) => (
                  <button key={c} onClick={() => s.set({ customAccent: c })} aria-label={`Accent ${c}`}
                    className={cx('w-7 h-7 rounded-full transition-transform hover:scale-115 flex items-center justify-center', s.customAccent === c && 'ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-[var(--bg)]')}
                    style={{ background: c }}>
                    {s.customAccent === c && <Check size={13} className="text-white drop-shadow" strokeWidth={3.5} />}
                  </button>
                ))}
              </div>
            </div>

            <SettingRow title="Dynamic album colors" sub="Tint the app and player with the current artwork">
              <Toggle checked={s.dynamicColors} onChange={(b) => s.set({ dynamicColors: b })} label="Dynamic album colors" />
            </SettingRow>
            <SettingRow title="Glass effects" sub="Frosted panels and blurred surfaces">
              <Toggle checked={s.glass} onChange={(b) => s.set({ glass: b })} label="Glass effects" />
            </SettingRow>

            <SliderRow title="Corner radius" value={s.radius} min={8} max={28} onChange={(v) => s.set({ radius: v })} format={(v) => `${v}px`} />
            <SliderRow title="Blur intensity" value={s.blur} min={0} max={40} onChange={(v) => s.set({ blur: v })} format={(v) => `${v}px`} />
            <SliderRow title="Card transparency" value={Math.round((1 - s.cardAlpha) * 100)} min={0} max={60}
              onChange={(v) => s.set({ cardAlpha: 1 - v / 100 })} format={(v) => `${v}%`} />

            <SettingRow title="Animations" sub="Reduced respects motion preferences; off disables nearly all motion">
              <Segmented<AnimLevel>
                options={[{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }, { value: 'off', label: 'Off' }]}
                value={s.animations}
                onChange={(v) => s.set({ animations: v })}
              />
            </SettingRow>
          </Section>

          {/* ================= audio ================= */}
          <Section id="audio" icon={Music2} title="Playback & audio" sub="Pipeline behavior and sound">
            <SliderRow title="Crossfade" sub="Blend the end of one song into the next" first
              value={s.crossfade} min={0} max={12} onChange={(v) => s.set({ crossfade: v })}
              format={(v) => (v === 0 ? 'Off' : `${v}s`)} />
            <SettingRow title="Volume normalization" sub="Levels out loudness differences between sources">
              <Toggle checked={s.normalization} onChange={(b) => s.set({ normalization: b })} label="Volume normalization" />
            </SettingRow>
            <SettingRow title="Preload next track" sub="Buffers the upcoming song for near-instant transitions">
              <Toggle checked={s.preloadNext} onChange={(b) => s.set({ preloadNext: b })} label="Preload next track" />
            </SettingRow>
            <SettingRow title="Stream quality preference" sub="Advisory only — Aura always plays the highest preview quality the provider offers and never claims more.">
              <Segmented<AudioQuality>
                options={[{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Data saver' }, { value: 'high', label: 'High' }]}
                value={s.quality === 'medium' ? 'auto' : s.quality}
                onChange={(v) => s.set({ quality: v })}
              />
            </SettingRow>
            <SettingRow title="Hardware media keys" sub="Play/pause and skip via your keyboard's media controls — always on, powered by the Media Session API">
              <Toggle checked onChange={() => toast({ title: 'Always enabled', sub: 'Media keys are core to Aura' })} label="Hardware media keys" />
            </SettingRow>
          </Section>

          {/* ================= network ================= */}
          <Section id="network" icon={Globe} title="Network & sources" sub="Where Aura gets its music">
            <SettingRow title="Music provider" first
              sub={`Currently using ${activeProviderName()}. 'All' merges search results from all active sources simultaneously.`}>
              <select
                className="input !h-9 !py-0 !pl-3 !pr-8 text-[13px] bg-surface hover:bg-surface-elevated transition-colors cursor-pointer w-[200px]"
                value={s.provider}
                onChange={(e) => {
                  const provider = e.target.value as ProviderPref;
                  s.set({ provider });
                  toast({ title: provider === 'all' ? 'All providers enabled' : `Switched to ${getProviders().find((p) => p.id === provider)?.name}`, sub: 'New content loads from this source', kind: 'success' });
                }}
              >
                <option value="all">All (Combined)</option>
                {getProviders().map((p) => (
                  <option key={p.id} value={p.id}>{p.name === 'Custom server' ? 'Custom URL' : p.name}</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow title="Apple iTunes" sub="Charts, search and official 30-second preview streams. No account needed.">
              <span className="chip !h-8">Previews</span>
            </SettingRow>
            <SettingRow title="Audius" sub="Open catalog from independent artists — full-length streams, no login, no key.">
              <span className="chip !h-8">Full tracks</span>
            </SettingRow>
            <SettingRow title="Jamendo client ID" sub="Free public key from dev.jamendo.com — unlocks a large full-length open catalog. It is designed for client-side use (rate-limited per key).">
              <input
                className="input !h-9 !w-[220px] !text-[12.5px]"
                placeholder="e.g. 8e4f3a2b"
                value={s.jamendoKey || ''}
                onChange={(e) => s.set({ jamendoKey: e.target.value.trim() })}
                aria-label="Jamendo client ID"
                spellCheck={false}
              />
            </SettingRow>
            <SettingRow title="Custom source URL" sub="Connect your own self-hosted content server (Aura Custom Source protocol — see README). The server must host content it has rights to.">
              <input
                className="input !h-9 !w-[220px] !text-[12.5px]"
                placeholder="https://music.example.com"
                value={s.customSourceUrl || ''}
                onChange={(e) => s.set({ customSourceUrl: e.target.value.trim() })}
                aria-label="Custom source URL"
                spellCheck={false}
              />
            </SettingRow>
            <SettingRow title="YouTube API Key" sub={
              <div className="space-y-1 mt-1 text-[12.5px]">
                <p>Unlocks YouTube Data API v3 search results and playlists.</p>
                <ol className="list-decimal pl-4 mt-1 opacity-80">
                  <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">Google Cloud Console</a>.</li>
                  <li>Create a new Project (or select one).</li>
                  <li>Go to <b>APIs & Services {'>'} Library</b> and enable the <b>YouTube Data API v3</b>.</li>
                  <li>Go to <b>APIs & Services {'>'} Credentials</b>, click <b>Create Credentials</b> and select <b>API key</b>.</li>
                  <li>(Leave the application restrictions as "None" so it works in your compiled app).</li>
                </ol>
              </div>
            }>
              <input
                className="input !h-9 !w-[220px] !text-[12.5px]"
                placeholder="AIzaSyB..."
                value={s.youtubeKey || ''}
                onChange={(e) => s.set({ youtubeKey: e.target.value.trim() })}
                aria-label="YouTube API Key"
                spellCheck={false}
                type="password"
              />
            </SettingRow>
          </Section>

          {/* ================= notifications ================= */}
          <Section id="notifications" icon={Bell} title="Notifications" sub="What's shown when a new song starts">
            <SettingRow title="Now playing alerts" first
              sub={s.notifications === 'native' ? 'Uses OS-level toasts' : 'Shown inside Aura, above the player'}>
              <Segmented<NotifyMode>
                options={[{ value: 'off', label: 'Off' }, { value: 'inapp', label: 'In-app' }, { value: 'native', label: 'Native' }]}
                value={s.notifications}
                onChange={(v) => { if (v === 'native') pickNative(); else s.set({ notifications: v }); }}
              />
            </SettingRow>
          </Section>

          {/* ================= shortcuts ================= */}
          <Section id="shortcuts" icon={Keyboard} title="Keyboard shortcuts" sub="Work anywhere in the app">
            <div className="py-2">
              {SHORTCUTS.map(([k, d], i) => (
                <div key={k} className={cx('flex items-center justify-between py-2.5 border-line', i > 0 && 'border-t')}>
                  <span className="text-soft text-[13px]">{d}</span>
                  <span className="flex gap-1.5">{k.split(' + ').map((p) => <Kbd key={p}>{p}</Kbd>)}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ================= storage ================= */}
          <Section id="storage" icon={HardDrive} title="Storage & privacy" sub="Your data lives only on this device">
            <SettingRow title="Local data" first sub={`${library.favorites.length} favorites · ${library.playlists.length} playlists · ${library.recent.length} history entries · ${storageSize(['aura-settings-v1', 'aura-library-v1', 'aura-player-v1'])} used`}>
              <span className="chip !h-8"><Shield size={12} /> On-device</span>
            </SettingRow>
            <SettingRow title="Search history" sub={`${library.searchHistory.length} saved searches`}>
              <button className="btn btn-ghost !h-9" onClick={() => { library.clearSearch(); toast({ title: 'Search history cleared' }); }} disabled={!library.searchHistory.length}>
                <Trash2 size={13} /> Clear
              </button>
            </SettingRow>
            <SettingRow title="Playback history" sub={`${library.recent.length} entries`}>
              <button className="btn btn-ghost !h-9" onClick={() => { library.clearRecent(); toast({ title: 'History cleared' }); }} disabled={!library.recent.length}>
                <Trash2 size={13} /> Clear
              </button>
            </SettingRow>
            <SettingRow title="Reset everything" sub={confirmReset ? 'This wipes favorites, playlists, history and settings. Really?' : 'Erase all local data and restart fresh'}>
              {confirmReset ? (
                <div className="flex gap-2">
                  <button className="btn btn-danger !h-9" onClick={() => {
                    ['aura-settings-v1', 'aura-library-v1', 'aura-player-v1'].forEach((k) => localStorage.removeItem(k));
                    window.location.reload();
                  }}>Yes, erase</button>
                  <button className="btn btn-ghost !h-9" onClick={() => setConfirmReset(false)}>Keep my data</button>
                </div>
              ) : (
                <button className="btn btn-danger !h-9" onClick={() => setConfirmReset(true)}>
                  <Trash2 size={13} /> Reset Aura
                </button>
              )}
            </SettingRow>
          </Section>
        </div>
      </div>
    </div>
  );
}
