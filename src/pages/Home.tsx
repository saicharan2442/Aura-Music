import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Play, Sparkles, TrendingUp } from 'lucide-react';
import { activeProvider } from '../services/providers';
import { useAsync, usePalette } from '../hooks';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import type { Track } from '../types';
import { greeting } from '../utils';
import { hslToHex, withAlpha } from '../themes/themes';
import { Artwork } from '../components/Artwork';
import { AlbumCard, ArtistCard, SongCard, WideTile } from '../components/cards';
import { SongRow } from '../components/SongRow';
import { ErrorState, HScroll, OfflineState, SectionHeader, SkeletonCards, SkeletonRowList } from '../components/ui';

/* ---------------- playable mix card ---------------- */

export function MixPlayCard({ name, query, desc, h1, h2 }: { name: string; query: string; desc: string; h1: number; h2: number }) {
  const [loading, setLoading] = useState(false);
  const toast = useUI((s) => s.toast);

  const playMix = async () => {
    setLoading(true);
    try {
      const tracks = await activeProvider.searchSongs(query, 24);
      if (tracks.length) usePlayer.getState().playContext(tracks, 0);
      else toast({ title: 'Nothing found for this mix', kind: 'error' });
    } catch (e: any) {
      toast({ title: 'Could not load mix', sub: e?.message, kind: 'error' });
    } finally { setLoading(false); }
  };

  return (
    <button onClick={playMix} disabled={loading}
      className="relative h-[132px] rounded-2xl overflow-hidden text-left p-5 border border-line card-hover group disabled:opacity-70"
      style={{ background: `linear-gradient(135deg, ${hslToHex(h1, 62, 40)}, ${hslToHex(h2, 66, 22)})` }}>
      <span className="display block text-white font-bold text-[19px] drop-shadow relative z-10">{name}</span>
      <span className="block text-white/75 text-[12px] mt-1 relative z-10 font-medium max-w-[220px] leading-relaxed">{desc}</span>
      <span className="absolute right-4 bottom-4 w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white transition-transform duration-300 group-hover:scale-110 z-10">
        {loading ? <span className="spinner !border-white/30 !border-t-white" /> : <Play size={16} className="fill-current ml-0.5" />}
      </span>
      <span className="absolute -right-8 -top-10 w-32 h-32 rounded-full bg-white/10 blur-2xl transition-transform duration-500 group-hover:scale-150" />
    </button>
  );
}

/* ---------------- home page ---------------- */

export default function Home() {
  const online = useUI((s) => s.online);
  const go = useUI((s) => s.go);
  const { data, error, loading, reload } = useAsync((signal) => activeProvider.homeFeed().then((d) => { void signal; return d; }), []);
  const recent = useLibrary((s) => s.recent);
  const dynamicColors = useSettings((s) => s.dynamicColors);
  const userName = useSettings((s) => s.userName);

  const featured = data?.charts?.[0] ?? null;
  const palette = usePalette(dynamicColors ? featured?.artwork : undefined, featured?.title ?? 'aura-home');
  const jumpBack = recent.slice(0, 6);
  const jumpTracks: Track[] = jumpBack.map((r) => r.track);

  if (!online && !data) return <OfflineState onRetry={reload} />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const pa = palette?.a ?? 'var(--accent)';
  const pb = palette?.b ?? 'var(--accent2)';
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-[1480px] mx-auto px-5 md:px-9 pt-7 pb-12 space-y-12">
      {/* ======================= hero ======================= */}
      <motion.section
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 0.68, 0.24, 1] }}
        className="relative overflow-hidden rounded-[28px] border border-line"
        style={{
          background: `radial-gradient(720px 420px at 88% -20%, ${typeof pb === 'string' && pb.startsWith('#') ? withAlpha(pb, 0.5) : 'color-mix(in srgb, var(--accent2) 30%, transparent)'}, transparent 65%), radial-gradient(680px 420px at -8% 130%, ${typeof pa === 'string' && pa.startsWith('#') ? withAlpha(pa, 0.45) : 'color-mix(in srgb, var(--accent) 30%, transparent)'}, transparent 62%), color-mix(in srgb, var(--card) 82%, transparent)`,
        }}
      >
        <div className="relative flex items-center gap-8 p-7 md:p-10 min-h-[256px]">
          <div className="flex-1 min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase text-soft">
              <CalendarDays size={12.5} /> {today}
            </p>
            <h1 className="display text-main font-bold text-[34px] md:text-[42px] leading-[1.06] tracking-tight mt-3">
              {userName?.trim() ? (
                <>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)]">
                    {userName.trim()}
                  </span>
                  <span className="text-soft font-normal">, </span>
                </>
              ) : null}
              {greeting()}<span style={{ color: 'var(--accent)' }}>.</span>
            </h1>
            <p className="text-soft text-[13.5px] mt-3 max-w-[420px] leading-relaxed">
              {featured ? (
                <>“<span className="text-main font-semibold">{featured.title}</span>” by {featured.artist} is trending right now — the charts just landed.</>
              ) : (
                'Your daily soundtrack is on its way — charts, new releases and mixes made for you.'
              )}
            </p>
            <div className="flex items-center gap-3 mt-7 flex-wrap">
              {featured && (
                <button className="btn btn-accent !h-11 !px-6" onClick={() => usePlayer.getState().playContext(data!.charts, 0)}>
                  <Play size={15} className="fill-current" /> Play the charts
                </button>
              )}
              <button className="btn btn-ghost !h-11 !px-6" onClick={() => go({ id: 'discover' })}>
                <TrendingUp size={15} /> Explore Discover
              </button>
            </div>
          </div>

          {/* featured artwork stack */}
          {featured ? (
            <button
              className="hidden md:block relative shrink-0 group/hero pr-8"
              onClick={() => usePlayer.getState().playContext(data!.charts, 0)}
              aria-label={`Play ${featured.title}`}
            >
              {data!.charts[2] && (
                <Artwork src={data!.charts[2].artwork} seed={data!.charts[2].title} alt="" eager
                  className="absolute top-1/2 -translate-y-1/2 -right-2 w-[128px] h-[128px] rounded-2xl rotate-[9deg] opacity-60 blur-[1px] transition-transform duration-500 group-hover/hero:rotate-[13deg]" />
              )}
              {data!.charts[1] && (
                <Artwork src={data!.charts[1].artwork} seed={data!.charts[1].title} alt="" eager
                  className="absolute top-1/2 -translate-y-1/2 right-20 w-[150px] h-[150px] rounded-2xl -rotate-[7deg] opacity-80 transition-transform duration-500 group-hover/hero:-rotate-[10deg]" />
              )}
              <Artwork src={featured.artwork} seed={featured.title} alt={featured.title} eager
                className="relative w-[176px] h-[176px] rounded-2xl shadow-2xl transition-transform duration-500 group-hover/hero:scale-[1.03]" />
              <span className="play-fab absolute -bottom-3 left-1/2 -translate-x-1/2 !w-12 !h-12">
                <Play size={17} className="fill-current ml-0.5" />
              </span>
            </button>
          ) : (
            <div className="hidden md:block skeleton w-[176px] h-[176px] rounded-2xl shrink-0" />
          )}
        </div>
      </motion.section>

      {/* ======================= jump back in ======================= */}
      <motion.section initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}>
        <SectionHeader title={jumpBack.length ? 'Jump back in' : 'Start something'} sub={jumpBack.length ? 'Your latest session' : 'Trending songs to kick things off'} action={jumpBack.length ? 'History' : undefined} onAction={() => go({ id: 'recent' })} />
        {jumpBack.length > 0 ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {jumpBack.map((r) => <WideTile key={r.at + r.track.id} track={r.track} context={jumpTracks} />)}
          </div>
        ) : loading ? (
          <SkeletonCards n={6} />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {(data?.charts ?? []).slice(0, 6).map((t) => <WideTile key={t.id} track={t} context={data!.charts} />)}
          </div>
        )}
      </motion.section>

      {/* ======================= popular today ======================= */}
      <motion.section initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}>
        <SectionHeader title="Popular today" sub="The most-played songs on the service right now" action="See more" onAction={() => go({ id: 'discover' })} />
        {data ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8">
            {data.charts.slice(0, 10).map((t, i) => (
              <SongRow key={t.id} track={t} index={i} context={data.charts} showAlbum dense />
            ))}
          </div>
        ) : (
          <SkeletonRowList n={10} />
        )}
      </motion.section>

      {/* ======================= new releases ======================= */}
      <motion.section initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}>
        <SectionHeader title="New releases" sub="Fresh albums and singles" />
        {data ? <HScroll>{data.newReleases.map((a) => <AlbumCard key={a.id} album={a} />)}</HScroll> : <SkeletonCards n={8} />}
      </motion.section>

      {/* ======================= trending artists ======================= */}
      <motion.section initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}>
        <SectionHeader title="Trending artists" sub="Voices everyone is listening to" />
        {data ? <HScroll>{data.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</HScroll> : <SkeletonCards n={8} circle />}
      </motion.section>

      {/* ======================= top albums ======================= */}
      <motion.section initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}>
        <SectionHeader title="Top albums" sub="Most-played albums this week" />
        {data ? <HScroll>{data.topAlbums.map((a) => <AlbumCard key={a.id} album={a} />)}</HScroll> : <SkeletonCards n={8} />}
      </motion.section>

      {/* ======================= made for you ======================= */}
      <motion.section initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}>
        <SectionHeader title="Made for you" sub="Instant mixes — press play and drift" />
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <MixPlayCard name="Daily Lift" query="feel good hits of 2025" desc="Bright, upbeat tracks to open the day" h1={264} h2={210} />
          <MixPlayCard name="Deep Focus" query="ambient focus instrumental" desc="Weightless soundscapes for deep work" h1={210} h2={250} />
          <MixPlayCard name="After Hours" query="late night r&b chill" desc="Slow-burning grooves for the evening" h1={330} h2={280} />
        </div>
        <p className="flex items-center gap-2 text-[11.5px] text-dim mt-6">
          <Sparkles size={12} className="text-acc" /> Mixes are generated live from your provider — always fresh, never stored.
        </p>
      </motion.section>

      {/* extra trending songs rail */}
      {data && data.charts.length > 10 && (
        <motion.section initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}>
          <SectionHeader title="Also trending" />
          <HScroll>{data.charts.slice(10, 22).map((t) => <SongCard key={t.id} track={t} context={data.charts} />)}</HScroll>
        </motion.section>
      )}
    </div>
  );
}
