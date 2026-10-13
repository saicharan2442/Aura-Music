import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnimLevel, NotifyMode, ThemeMode } from '../types';
import { DEFAULT_THEME } from '../themes/themes';

/* ------------------------------------------------------------------ */
/*  Settings — persisted locally. No server, no database.             */
/* ------------------------------------------------------------------ */

export type AudioQuality = 'auto' | 'low' | 'medium' | 'high';
export type ProviderPref = 'all' | 'itunes' | 'audius' | 'jamendo' | 'custom' | 'archive' | 'youtube';

interface SettingsState {
  /* network */
  provider: ProviderPref;
  jamendoKey: string;
  youtubeKey: string;
  customSourceUrl: string;
  /* appearance */
  themeId: string;
  mode: ThemeMode;
  customAccent: string | null;
  dynamicColors: boolean;
  glass: boolean;
  radius: number;          // px  8..28
  blur: number;            // px  0..40
  cardAlpha: number;       // 0.35..0.95
  animations: AnimLevel;
  /* playback & audio */
  crossfade: number;       // seconds 0..12
  normalization: boolean;
  preloadNext: boolean;
  quality: AudioQuality;
  notifications: NotifyMode;
  speed: number;
  /* interface */
  sidebarCollapsed: boolean;
  /* user profile */
  userName: string;
  /* lifecycle */
  hasOnboarded: boolean;
  set: (patch: Partial<SettingsState>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      provider: 'all',
      jamendoKey: '',
      youtubeKey: '',
      customSourceUrl: '',
      themeId: DEFAULT_THEME,
      mode: 'dark',
      customAccent: null,
      dynamicColors: true,
      glass: true,
      radius: 18,
      blur: 20,
      cardAlpha: 0.72,
      animations: 'full',
      crossfade: 0,
      normalization: true,
      preloadNext: true,
      quality: 'auto',
      notifications: 'inapp',
      speed: 1,
      sidebarCollapsed: false,
      userName: '',
      hasOnboarded: false,
      set: (patch) => set(patch),
    }),
    { name: 'aura-settings-v1' }
  )
);
