# Aura Music 🎵

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/saicharan2442/Aura-Music/releases)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Aura Music** is a 2026-generation desktop music experience designed for Windows. Combining fluid animations, real-time beat-reactive subwoofer visuals, live time-synced lyrics, and instant full-length music streaming with zero accounts and zero tracking.

---

## ✨ Features & Highlights (v1.1.0)

### 🌊 Real-Time Subwoofer Beat Visualizer & Wave Creator
- **Speaker Cone Bass Pulse**: Center artwork vibrates and bounces with elastic subwoofer cone throws in real time based on acoustic and heuristic musical beat detection.
- **360° Radial Wave Creator**: YouTube / Avee Player / Trap Nation style radial sound wave bars with fluid crest splines, traveling harmonics, and expanding bass shockwave rings.
- **Beat-Sync Tapping**: Click or tap the center album disc anytime to snap the visualizer's phase directly to the downbeat.

### 🎤 Live Time-Synced Lyrics with Dead-Center Auto-Scroll
- **Continuous Middle Locking**: Active lyric line is locked dead-center in the vertical middle of the screen as playback advances till the end of the song.
- **Side-by-Side Split View**: Left side hosts the full player (artwork disc, wave visualizer, seekbar, controls, up-next queue) while the right side displays the live scrolling lyrics.
- **Click-to-Seek**: Click any lyric line to jump playback directly to that timestamp without resetting the song.
- **Add & Edit Custom Lyrics**: Paste LRC time-synced (`[mm:ss.xx]`) or plain text lyrics with automatic local persistence and live auto-scroll.

### 🎬 Seamless Video Mode
- **Dual Mode Player**: Seamlessly switch between the animated Album Art disc and YouTube Full HD video playback.
- **Zero Interruption**: Toggling between artwork, lyrics, and video keeps audio playing smoothly without reloading or jumping back to the beginning.
- **Full Screen Support**: Built-in full screen mode with auto-hiding controls (<kbd>F</kbd> key shortcut).

### 🔍 Universal Search & Multi-Provider Engine
- **Global Music Library**: Instant search powered by intelligent multi-source aggregation (YouTube, Apple iTunes, Audius, Jamendo, Internet Archive, and Live Radio).
- **Intelligent Title Sanitization**: Automatic parsing and noise removal (`Full Video`, `Official Audio`, `4K`, etc.) ensures exact song matching across international and regional catalogs.
- **Automatic Failover**: Health checks prevent downtime—if any upstream source encounters a glitch, search smoothly continues without breaking the user experience.

### 🎨 Deep Customization & Theming
- **10 Curated Themes**: Midnight, AMOLED, Ocean, Aurora, Sunset, Purple, Cyber, Forest, Minimal, and Light.
- **Dynamic Palette Coloring**: Ambient backdrops extract vibrant colors directly from the active song's artwork.
- **Full Surface Controls**: Adjustable blur intensity, card transparency, corner radius, custom hex accents, and animations.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause |
| <kbd>Ctrl</kbd> + <kbd>→</kbd> | Next track |
| <kbd>Ctrl</kbd> + <kbd>←</kbd> | Previous track |
| <kbd>Ctrl</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Volume up / down |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Focus omnibox search |
| <kbd>Ctrl</kbd> + <kbd>L</kbd> | Favorite current track |
| <kbd>Ctrl</kbd> + <kbd>Q</kbd> | Toggle queue drawer |
| <kbd>Ctrl</kbd> + <kbd>M</kbd> | Mute / Unmute |
| <kbd>F</kbd> | Fullscreen video (in video mode) |
| <kbd>Esc</kbd> | Close full-screen Now Playing, lyrics, or dialogs |

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Framer Motion, Lucide Icons, Zustand.
- **Desktop Framework**: Tauri v2 (Rust backend with native Windows WebView2).
- **Build System**: Vite 7 with single-file optimization.
- **CI/CD**: GitHub Actions automated `.exe` builder releasing version `1.1.0`.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or v20+)
- [Rust & Cargo](https://www.rust-lang.org/) (for desktop builds)

### Local Development

```bash
# Clone the repository
git clone https://github.com/saicharan2442/Aura-Music.git
cd Aura-Music

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

Visit `http://localhost:5173` to explore Aura Music in your browser.

---

## 📦 Building the Windows Executable (`.exe`)

### 1. Automated via GitHub Actions
Whenever code is pushed to `main` with version `1.1.0`, the automated GitHub Actions workflow (`.github/workflows/build-exe.yml`) will:
1. Compile the production bundle.
2. Build the Tauri desktop executable and NSIS installer.
3. Automatically publish a **GitHub Release v1.1.0** containing the downloadable `.exe` installer.
4. Upload the built `.exe` to the GitHub Actions Artifacts section.

### 2. Local Desktop Build

```bash
# Build desktop executable locally
npm run tauri build
```

The compiled binaries will be output to:
`src-tauri/target/release/bundle/nsis/Aura Music_1.1.0_x64-setup.exe`

---

## 📄 Privacy & Legal

- **100% Client-Side Privacy**: Favorites, custom lyrics, playlists, history, and user settings stay exclusively on your local machine (`localStorage`). No telemetry, accounts, or user data collection.
- **Open Protocols**: Audio is streamed on-demand from permitted public APIs and CDNs. Metadata and lyrics are cached in-memory only.

---

## 👨‍💻 Author

**Developed with ❤️ by Saicharan Sada**  
GitHub: [@saicharan2442](https://github.com/saicharan2442)
