import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Heart, ListMusic, Palette, Radio, User } from 'lucide-react';
import { useSettings } from '../store/settings';
import { THEMES } from '../themes/themes';
import { cx } from '../utils';
import { Logo } from './Logo';

/* Onboarding: welcome & name → choose theme → ready. Runs once, persisted. */

const ACCENTS = ['#7c6cff', '#3fd4ff', '#22e37b', '#ff7a59', '#ff5fb0', '#f5c542', '#b26bff', '#e8e3d9'];

export function FirstRun() {
  const hasOnboarded = useSettings((s) => s.hasOnboarded);
  const userName = useSettings((s) => s.userName);
  const [step, setStep] = useState(0);
  if (hasOnboarded && userName?.trim()) return null;
  return <Inner step={step} setStep={setStep} />;
}

export function ThemePreview({ id, active, onPick }: { id: string; active: boolean; onPick: () => void }) {
  const t = THEMES.find((x) => x.id === id)!;
  const v = t.vars;
  return (
    <button onClick={onPick} className="group text-left" aria-pressed={active}>
      <div
        className={cx(
          'relative h-[86px] rounded-xl overflow-hidden border-2 transition-all duration-200',
          active ? 'border-[var(--accent)] shadow-lg scale-[1.02]' : 'border-line group-hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]'
        )}
        style={{ background: v.bg }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-[26px]" style={{ background: v.card, borderRight: `1px solid ${v.border}` }}>
          <span className="block w-2.5 h-2.5 rounded-full mx-auto mt-2.5" style={{ background: v.accent }} />
          <span className="block w-3 h-1 rounded-full mx-auto mt-2" style={{ background: v.soft, opacity: 0.5 }} />
          <span className="block w-3 h-1 rounded-full mx-auto mt-1" style={{ background: v.soft, opacity: 0.3 }} />
        </div>
        <div className="absolute left-[34px] top-2.5 w-[46%] h-2 rounded-full" style={{ background: v.soft, opacity: 0.4 }} />
        <div className="absolute left-[34px] top-6 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block w-7 h-7 rounded-md" style={{ background: i === 0 ? v.accent : v.elev }} />
          ))}
        </div>
        <div className="absolute left-[34px] bottom-2.5 right-3 h-[3px] rounded-full" style={{ background: `linear-gradient(90deg, ${v.accent} 40%, ${v.border} 40%)` }} />
        {active && (
          <span className="absolute right-1.5 top-1.5 w-4.5 h-4.5 p-0.5 rounded-full flex items-center justify-center" style={{ background: v.accent }}>
            <Check size={11} style={{ color: v.onAccent }} strokeWidth={3.5} />
          </span>
        )}
      </div>
      <p className={cx('text-[12px] font-semibold mt-2 text-center', active ? 'text-main' : 'text-dim')}>{t.name}</p>
    </button>
  );
}

function Inner({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  const set = useSettings((s) => s.set);
  const themeId = useSettings((s) => s.themeId);
  const customAccent = useSettings((s) => s.customAccent);
  const storedName = useSettings((s) => s.userName);
  const [nameInput, setNameInput] = useState(storedName || '');

  const finish = () => set({ hasOnboarded: true, userName: nameInput.trim() });

  return (
    <motion.div className="fixed inset-0 z-[96] app-bg grain flex items-center justify-center p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Welcome to Aura Music">
      <div className="w-full max-w-[760px]">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }} className="text-center">
              <div className="flex justify-center"><Logo size={76} glow /></div>
              <h1 className="display text-main font-bold text-[38px] mt-8 tracking-tight">
                Welcome to <span style={{ background: 'linear-gradient(120deg, var(--accent), var(--accent2))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Aura</span>
              </h1>
              <p className="text-soft text-[15px] mt-3 max-w-[440px] mx-auto leading-relaxed">
                Your modern internet music player — live charts, instant search, local playlists and a player that adapts to every album.
              </p>

              {/* Name prompt */}
              <div className="mt-7 max-w-[360px] mx-auto">
                <label htmlFor="user-name-input" className="block text-[12.5px] font-semibold text-soft mb-2 text-center">
                  What should we call you?
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
                  <input
                    id="user-name-input"
                    type="text"
                    placeholder="Enter your name…"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        set({ userName: nameInput.trim() });
                        setStep(1);
                      }
                    }}
                    maxLength={32}
                    autoFocus
                    className="input !h-11 !pl-10 !pr-4 !rounded-xl !bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:!border-[var(--accent)] text-[14.5px] font-medium text-center shadow-inner"
                  />
                </div>
              </div>

              <div className="flex items-center justify-center gap-2.5 mt-7 flex-wrap">
                {[
                  { icon: Radio, label: 'Live charts' },
                  { icon: Heart, label: 'Local favorites' },
                  { icon: ListMusic, label: 'Playlists' },
                  { icon: Palette, label: 'Full theming' },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} className="chip !h-9 !px-4"><Icon size={13.5} />{label}</span>
                ))}
              </div>
              <button
                className="btn btn-accent !h-12 !px-8 !text-[14px] mt-8"
                onClick={() => {
                  set({ userName: nameInput.trim() });
                  setStep(1);
                }}
              >
                Continue <ArrowRight size={16} />
              </button>
              <p className="text-dim text-[11.5px] mt-5">No account required · your data never leaves this device</p>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}>
              <h2 className="display text-main font-bold text-[26px] text-center">Choose your look</h2>
              <p className="text-dim text-[13px] text-center mt-1.5">Try a few — everything updates live. You can fine-tune it later in Settings.</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 mt-7">
                {THEMES.map((t) => (
                  <ThemePreview key={t.id} id={t.id} active={themeId === t.id}
                    onPick={() => set({ themeId: t.id, mode: t.scheme })} />
                ))}
              </div>
              <div className="flex items-center justify-center gap-3 mt-7">
                <span className="text-[12px] text-dim font-medium">Accent</span>
                {ACCENTS.map((c) => (
                  <button key={c} aria-label={`Accent ${c}`}
                    onClick={() => set({ customAccent: c === '#7c6cff' ? null : c })}
                    className={cx('w-6 h-6 rounded-full transition-transform hover:scale-115', customAccent === c && 'ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-[var(--bg)]')}
                    style={{ background: c }} />
                ))}
              </div>
              <div className="flex justify-center gap-3 mt-8">
                <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn-accent !px-7" onClick={() => setStep(2)}>Continue <ArrowRight size={15} /></button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }} className="text-center">
              <div className="flex justify-center"><Logo size={64} glow /></div>
              <h2 className="display text-main font-bold text-[30px] mt-7">
                {nameInput.trim() ? `You're all set, ${nameInput.trim()}!` : "You're all set"}
              </h2>
              <p className="text-soft text-[14px] mt-2.5 max-w-[400px] mx-auto leading-relaxed">
                Search for music and start listening. Everything you love stays in your library — right here on this device.
              </p>
              <div className="inline-flex flex-col gap-2.5 mt-7 text-left">
                {[
                  ['Space', 'Play / pause'],
                  ['Ctrl F', 'Jump to search'],
                  ['Ctrl L', 'Favorite current track'],
                  ['Right-click', 'More actions on any song'],
                ].map(([k, d]) => (
                  <div key={k} className="flex items-center gap-3.5">
                    <span className="w-[86px] text-right"><kbd className="px-2 py-1 rounded-md bg-elev border border-line text-[11px] font-semibold text-soft">{k}</kbd></span>
                    <span className="text-soft text-[13px]">{d}</span>
                  </div>
                ))}
              </div>
              <div className="mt-9">
                <button className="btn btn-accent !h-12 !px-9 !text-[14px]" onClick={finish}>Start listening</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
