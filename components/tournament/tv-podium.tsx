'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { playerDisplayName } from '@/lib/utils/player-name';
import { localizedTitle } from '@/lib/utils/player-title';
import { formatScore } from '@/lib/utils/chess';
import { podiumPhotoUrl, startPodiumCeremony, type PodiumOption, type PodiumPlayer } from '@/lib/tournament/podium';
import { TournamentLogo } from './tournament-logo';
import { PodiumMusic, type PodiumMusicControls } from './podium-music';
import styles from './tv-podium.module.css';

export function TvPodium({ options, tournamentId, tournamentName, slug, locale }: {
  options: PodiumOption[]; tournamentId: string; tournamentName: string; slug: string; locale: string;
}) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? '');
  const music = useRef<PodiumMusicControls>(null);
  const option = options.find((item) => item.id === selectedId) ?? options[0];
  // Winner changes reset the ceremony; identical live refreshes keep it intact.
  const identity = option ? `${option.id}:${option.players.map((p) => `${p.position}/${p.playerId}/${p.points}`).join(',')}` : '';
  // Keep selection/volume on a category change, but don't play during the next setup.
  useEffect(() => { music.current?.pause(); }, [identity]);
  return (
    <div className={styles.scene}>
      <div className="relative z-10 mx-auto mb-4 flex max-w-4xl items-center justify-center gap-4 text-center">
        <TournamentLogo tournamentId={tournamentId} />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-200">Celebração dos campeões</p>
          <h1 className="mt-2 break-words text-xl font-black sm:text-3xl">{tournamentName}</h1>
        </div>
      </div>
      {!option ? <p className="p-8 text-center text-brand-100">Ainda não há classificação final disponível para apresentar.</p> : (
        <>
          <div className="relative z-10 mx-auto mb-5 flex max-w-2xl flex-wrap items-center justify-center gap-3">
            <label htmlFor="podium-category" className="text-sm font-semibold">Pódio de</label>
            <select id="podium-category" value={option.id} onChange={(event) => setSelectedId(event.target.value)} className="min-h-11 max-w-full rounded-lg border border-white/30 bg-brand-950 px-3 py-2 font-semibold text-white">
              {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <PodiumMusic ref={music} />
          <PodiumCeremony key={identity} option={option} slug={slug} locale={locale} onStart={() => music.current?.restart()} />
        </>
      )}
    </div>
  );
}

function PodiumCeremony({ option, slug, locale, onStart }: { option: PodiumOption; slug: string; locale: string; onStart: () => void }) {
  const [run, setRun] = useState(0);
  const [stage, setStage] = useState(0);
  const [animated, setAnimated] = useState(false);
  const positionsKey = option.players.map((player) => player.position).sort().join(',');
  const places = [2, 1, 3].flatMap((position) => {
    const player = option.players.find((item) => item.position === position);
    return player ? [player] : [];
  });
  const firstAward = Math.max(...places.map((player) => player.position));
  useEffect(() => {
    if (!run) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setAnimated(!reduced);
    return startPodiumCeremony(setStage, reduced, positionsKey.split(',').map(Number));
  }, [run, positionsKey]);
  const announced = option.players.find((player) => player.position === 4 - stage);
  const name = (player: PodiumPlayer) => playerDisplayName(player.name, player.fideName, locale);
  return (
    <>
      <div className="relative z-10 mb-3 flex flex-wrap justify-center gap-3">
        <button type="button" disabled={!option.players.length} className="min-h-11 rounded-xl bg-amber-300 px-5 py-2 font-bold text-amber-950 shadow-lg hover:bg-amber-200 disabled:opacity-50" onClick={() => { onStart(); setStage(0); setRun((value) => value + 1); }}>
          {run || stage ? 'Repetir apresentação' : 'Iniciar apresentação'}
        </button>
        <button type="button" disabled={!option.players.length} className="min-h-11 rounded-xl border border-white/30 px-4 py-2 font-semibold hover:bg-white/10 disabled:opacity-50" onClick={() => { setRun(0); setAnimated(false); setStage(3); }}>Mostrar pódio completo</button>
      </div>
      <p role="status" aria-live="polite" className="relative z-10 mb-4 min-h-6 text-center text-sm text-amber-100">
        {!option.players.length ? 'Não há posições finais confirmadas nesta categoria.' : stage === 0 ? `Preparem os aplausos! A revelação começa pelo ${firstAward}º lugar.` : announced ? `${announced.position}º lugar · ${name(announced)}${stage === 3 ? ' · Campeão!' : ''}` : 'Celebrando os premiados desta categoria'}
      </p>
      {stage === 3 && animated && option.players.some((p) => p.position === 1) && (
        <div key={run} aria-hidden="true" className={styles.confetti}>
          {Array.from({ length: 24 }, (_, i) => <span key={i} style={{ '--i': i, '--x': `${(i * 37) % 100}%`, '--drift': `${((i * 61) % 240) - 120}px` } as CSSProperties} />)}
        </div>
      )}
      {places.length > 0 && <div className={styles.podium} role="group" aria-label={`Pódio · ${option.label}`} style={{ gridTemplateColumns: `repeat(${places.length}, minmax(0, 1fr))`, maxWidth: places.length === 1 ? '24rem' : places.length === 2 ? '44rem' : undefined }}>
        {places.map((player) => {
          const { position } = player;
          const visible = stage >= 4 - position;
          return (
            <div key={position} className={`${styles.place} ${styles[`place${position}`]}`}>
              <div className={styles.winnerSpace}>
                <div className={`${styles.winner} ${visible ? animated ? styles.revealed : '' : styles.waiting}`} aria-hidden={!visible}>
                  {position === 1 && <span className={styles.trophy} aria-hidden="true">🏆</span>}
                  <PodiumPortrait player={player} src={podiumPhotoUrl(slug, option.id, player.playerId)} name={name(player)} />
                  <p className={styles.name}>{player.title && <span className="mr-1 text-[0.75em] font-semibold text-amber-200">{localizedTitle(player.title, locale)}</span>}{name(player)}</p>
                  <p className="mt-1 text-sm font-semibold text-brand-100">{player.points === 0.5 ? '½' : formatScore(player.points)} pts</p>
                </div>
              </div>
              <div className={styles.step} aria-label={`${position}º lugar`}><span aria-hidden="true">{position === 1 ? '🥇' : position === 2 ? '🥈' : '🥉'}</span><strong>{position}º</strong></div>
            </div>
          );
        })}
      </div>}
      {option.players.length > 0 && option.players.length < 3 && <p className="relative z-10 mt-4 text-center text-xs text-brand-200">Somente {option.players.length} {option.players.length === 1 ? 'posição confirmada' : 'posições confirmadas'} nesta categoria.</p>}
    </>
  );
}

function PodiumPortrait({ player, src, name }: { player: PodiumPlayer; src: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.portrait}>
      {!loaded && <Image src="/images/chess-pieces/pawn-white-v1.png" alt="" width={160} height={160} sizes="(min-width: 768px) 160px, 80px" className="h-full w-full object-contain p-2" />}
      {!failed && <Image key={player.playerId} src={src} alt={`Foto de ${name}`} aria-hidden={!loaded} unoptimized width={160} height={160} className={`absolute inset-0 h-full w-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setFailed(true); }} />}
    </div>
  );
}
