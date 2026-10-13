import { create } from 'zustand';
import type { Page, Track } from '../types';
import { uid } from '../utils';

/* ------------------------------------------------------------------ */
/*  UI store — navigation, overlays, toasts, menus, modals.           */
/* ------------------------------------------------------------------ */

export interface MenuState { x: number; y: number; track: Track; context?: 'recent' | 'queue' | 'playlist'; playlistId?: string; qid?: string; }
export interface ModalState { type: 'createPlaylist' | 'renamePlaylist' | 'addToPlaylist' | 'confirmDeletePlaylist'; payload?: any; }
export interface Toast { id: string; title: string; sub?: string; art?: string; kind?: 'info' | 'success' | 'error'; }

interface UIState {
  page: Page;
  past: Page[];
  future: Page[];
  go: (p: Page) => void;
  back: () => void;
  forward: () => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  queueOpen: boolean;
  setQueueOpen: (b: boolean) => void;
  npOpen: boolean;
  setNpOpen: (b: boolean) => void;
  miniMode: boolean;
  setMiniMode: (b: boolean) => void;
  videoMode: boolean;
  setVideoMode: (b: boolean) => void;
  lyricsMode: boolean;
  setLyricsMode: (b: boolean) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchFocus: number;
  requestSearchFocus: () => void;

  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  menu: MenuState | null;
  openMenu: (m: MenuState) => void;
  closeMenu: () => void;

  modal: ModalState | null;
  openModal: (m: ModalState) => void;
  closeModal: () => void;

  online: boolean;
  setOnline: (b: boolean) => void;
}

export const useUI = create<UIState>()((set, get) => ({
  page: { id: 'home' },
  past: [],
  future: [],
  go: (p) => {
    const { page, past } = get();
    set({ page: p, past: [...past, page].slice(-40), future: [], menu: null });
  },
  back: () => {
    const { past, page, future } = get();
    if (!past.length) return;
    set({ page: past[past.length - 1], past: past.slice(0, -1), future: [page, ...future], menu: null });
  },
  forward: () => {
    const { past, page, future } = get();
    if (!future.length) return;
    set({ page: future[0], past: [...past, page], future: future.slice(1), menu: null });
  },

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  queueOpen: false,
  setQueueOpen: (b) => set({ queueOpen: b }),
  npOpen: false,
  setNpOpen: (b) => set({ npOpen: b }),
  miniMode: false,
  setMiniMode: (b) => set({ miniMode: b }),
  videoMode: false,
  setVideoMode: (b) => set({ videoMode: b }),
  lyricsMode: false,
  setLyricsMode: (b) => set({ lyricsMode: b }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  searchFocus: 0,
  requestSearchFocus: () => set((s) => ({ searchFocus: s.searchFocus + 1 })),

  toasts: [],
  toast: (t) => {
    const id = uid('t');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    window.setTimeout(() => get().dismissToast(id), 3600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  menu: null,
  openMenu: (m) => set({ menu: m }),
  closeMenu: () => set({ menu: null }),

  modal: null,
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: null }),

  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  setOnline: (b) => set({ online: b }),
}));
