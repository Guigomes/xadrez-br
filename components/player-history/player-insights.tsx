'use client';

import { useMemo } from 'react';
import { useEntitlements } from '@/lib/hooks/use-entitlements';
import type { HGame } from '@/lib/player-history/types';
import { numberLabel } from '@/lib/player-history/types';
import {
  STRENGTH_LABEL, byColor, byStrength, byTimeControl, streaks, tournamentPerformances,
  type StrengthBand, type Tally, type TournamentPerformance,
} from '@/lib/player-history/insights';

/** Estatísticas avançadas do perfil (premium: entitlement player.stats). */
export function PlayerInsights({ games }: { games: HGame[] }) {
  const entitlements = useEntitlements();
  const data = useMemo(() => ({
    color: byColor(games),
    pace: byTimeControl(games),
    strength: byStrength(games),
    perf: tournamentPerformances(games),
    streak: streaks(games),
  }), [games]);

  if (entitlements.isLoading) return null;
  if (!entitlements.can('player.stats')) {
    return (
      <div className="card p-5 mb-6 text-center">
        <p className="font-medium text-gray-900 dark:text-gray-100">Estatísticas avançadas</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Aproveitamento por cor, ritmo e força do adversário, performance por torneio e evolução do rating
          fazem parte da assinatura Jogador+.
        </p>
      </div>
    );
  }

  const { color, pace, strength, perf, streak } = data;
  return (
    <section className="card p-5 mb-6 space-y-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold text-gray-900 dark:text-gray-100">Estatísticas avançadas</h2>
        <span className="text-xs text-gray-400">partidas jogadas, sem W.O.</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Big label="Invicto há" value={`${streak.currentUnbeaten} partida${streak.currentUnbeaten === 1 ? '' : 's'}`} />
        <Big label="Maior invencibilidade" value={String(streak.bestUnbeaten)} />
        <Big label="Mais vitórias seguidas" value={String(streak.bestWins)} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Block title="Por cor">
          <Bar label="Brancas" t={color.white} />
          <Bar label="Pretas" t={color.black} />
        </Block>
        <Block title="Por ritmo">
          {pace.map((p) => <Bar key={p.label} label={p.label} t={p.tally} />)}
        </Block>
      </div>

      <Block title="Pela força do adversário" note={`${strength.rated} partida(s) com o rating dos dois lados.`}>
        {(['stronger', 'similar', 'weaker'] as StrengthBand[]).map((b) => <Bar key={b} label={STRENGTH_LABEL[b]} t={strength.bands[b]} />)}
      </Block>

      {perf.some((p) => p.performance !== null) && (
        <Block
          title="Performance por torneio"
          note="Performance = média dos adversários com rating + diferença pelo aproveitamento contra eles (fórmula do Elo, limitada a ±800). Rating do jogador: o da época no arquivo histórico; nos torneios do site, o atual do cadastro."
        >
          <PerformanceChart perf={perf.filter((p) => p.performance !== null)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="py-1 pr-2 font-medium">Data</th>
                  <th className="py-1 pr-2 font-medium">Torneio</th>
                  <th className="py-1 pr-2 font-medium text-right">Pontos</th>
                  <th className="py-1 pr-2 font-medium text-right">Média adv.</th>
                  <th className="py-1 font-medium text-right">Performance</th>
                </tr>
              </thead>
              <tbody>
                {[...perf].reverse().slice(0, 12).map((p) => (
                  <tr key={p.tournamentId} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-gray-500 dark:text-gray-400">{p.date.slice(8, 10)}/{p.date.slice(5, 7)}/{p.date.slice(0, 4)}</td>
                    <td className="py-1.5 pr-2 text-gray-900 dark:text-gray-100">{p.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{numberLabel(p.points)}/{p.played}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{p.avgOpponent ?? '—'}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{p.performance ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      )}
    </section>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-center">
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <div className="space-y-2">{children}</div>
      {note && <p className="mt-2 text-xs text-gray-400">{note}</p>}
    </div>
  );
}

function Bar({ label, t }: { label: string; t: Tally }) {
  const pct = t.pct ?? 0;
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="tabular-nums text-gray-500 dark:text-gray-400">
          {t.played ? `${numberLabel(pct)}% · ${t.wins}V ${t.draws}E ${t.losses}D` : 'sem partidas'}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Linha: rating do jogador; pontos: performance em cada torneio (ordem cronológica). */
function PerformanceChart({ perf }: { perf: TournamentPerformance[] }) {
  if (perf.length < 2) return null;
  const W = 640, H = 180, PAD = 28;
  const values = perf.flatMap((p) => [p.performance, p.myRating]).filter((v): v is number => v !== null);
  const min = Math.floor((Math.min(...values) - 50) / 100) * 100;
  const max = Math.ceil((Math.max(...values) + 50) / 100) * 100;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (perf.length - 1);
  const y = (v: number) => H - PAD - ((v - min) * (H - 2 * PAD)) / (max - min || 1);
  const ratingPts = perf.map((p, i) => (p.myRating !== null ? `${x(i)},${y(p.myRating)}` : null)).filter(Boolean).join(' ');
  return (
    <figure className="mb-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto text-brand-600 dark:text-brand-400" role="img"
        aria-label="Gráfico de performance por torneio e rating do jogador ao longo do tempo">
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} className="stroke-gray-200 dark:stroke-gray-800" strokeWidth={1} />
            <text x={4} y={y(v) + 4} className="fill-gray-400" fontSize={10}>{Math.round(v)}</text>
          </g>
        ))}
        {ratingPts && <polyline points={ratingPts} fill="none" className="stroke-gray-400" strokeWidth={2} strokeDasharray="4 3" />}
        {perf.map((p, i) => (
          <circle key={p.tournamentId} cx={x(i)} cy={y(p.performance!)} r={4} fill="currentColor">
            <title>{`${p.name}: performance ${p.performance}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span><span className="inline-block h-2 w-2 rounded-full bg-brand-500 align-middle" /> performance no torneio</span>
        <span><span className="inline-block w-4 border-t-2 border-dashed border-gray-400 align-middle" /> rating do jogador</span>
      </figcaption>
    </figure>
  );
}
