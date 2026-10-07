'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Select } from '@/components/ui/select';
import { GameViewerButton, RESULT_TEXT } from './game-viewer';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/date';
import {
  OUTCOME_CLASS,
  OUTCOME_LABEL,
  numberLabel,
  tournamentHref,
  wasPlayed,
  type HGame,
} from '@/lib/player-history/types';

// Histórico completo do jogador (todos os torneios e partidas). Mesma tela validada no
// Minhas Partidas: números clicáveis, adversários com "ver jogos", partidas por torneio.

type Detail = 'tournaments' | 'win' | 'draw' | 'loss' | 'pgn';
const DETAIL_PAGE = 30;

type OpponentSort = 'games' | 'recent' | 'oldest' | 'name' | 'wins' | 'losses' | 'percent';
const OPPONENT_SORT_OPTIONS: { value: OpponentSort; label: string }[] = [
  { value: 'games', label: 'Mais jogos' },
  { value: 'recent', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'name', label: 'Nome (A-Z)' },
  { value: 'wins', label: 'Mais vitórias' },
  { value: 'losses', label: 'Mais derrotas' },
  { value: 'percent', label: 'Melhor aproveitamento' },
];

type OpponentRecord = {
  key: string;
  id: string | null;
  name: string;
  cbxId: string | null;
  wins: number;
  draws: number;
  losses: number;
  lastDate: string;
  games: HGame[];
};

const viewable = (g: HGame, tournamentName = g.tournamentName) => ({
  source: g.source,
  gameId: g.id.split(':')[1],
  whiteName: g.whiteName,
  blackName: g.blackName,
  resultText: RESULT_TEXT[g.result] ?? g.result,
  round: g.round,
  tournamentName,
});

function bump(rec: { wins: number; draws: number; losses: number }, g: HGame) {
  if (g.outcome === 'win') rec.wins++;
  else if (g.outcome === 'draw') rec.draws++;
  else rec.losses++;
}

export function PlayerHistoryView({ games }: { games: HGame[] }) {
  const [openOpponents, setOpenOpponents] = useState<Set<string>>(new Set());
  const [opponentSort, setOpponentSort] = useState<OpponentSort>('games');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLimit, setDetailLimit] = useState(DETAIL_PAGE);

  function toggleDetail(next: Detail) {
    setDetail((cur) => (cur === next ? null : next));
    setDetailLimit(DETAIL_PAGE);
  }
  function toggleOpponent(opponentKey: string) {
    setOpenOpponents((prev) => {
      const next = new Set(prev);
      if (!next.delete(opponentKey)) next.add(opponentKey);
      return next;
    });
  }

  const stats = useMemo(() => {
    const s = { wins: 0, draws: 0, losses: 0, forfeits: 0 };
    for (const g of games) {
      if (!wasPlayed(g)) s.forfeits++;
      else bump(s, g);
    }
    const played = s.wins + s.draws + s.losses;
    return { ...s, played, pct: played ? ((s.wins + s.draws / 2) / played) * 100 : 0 };
  }, [games]);

  // Confronto direto com cada adversário (só partidas jogadas, sem W.O.).
  const opponents = useMemo(() => {
    const map = new Map<string, OpponentRecord>();
    for (const g of games) {
      if (!wasPlayed(g)) continue;
      const rec = map.get(g.opp.key) ?? {
        key: g.opp.key, id: g.opp.id, name: g.opp.name, cbxId: g.opp.cbxId,
        wins: 0, draws: 0, losses: 0, lastDate: g.date, games: [],
      };
      rec.games.push(g);
      bump(rec, g);
      if (g.date > rec.lastDate) rec.lastDate = g.date;
      map.set(g.opp.key, rec);
    }
    for (const rec of map.values()) rec.games.sort((a, b) => b.date.localeCompare(a.date) || a.round - b.round);
    return [...map.values()];
  }, [games]);

  const sortedOpponents = useMemo(() => {
    const total = (o: OpponentRecord) => o.wins + o.draws + o.losses;
    const percent = (o: OpponentRecord) => (o.wins + o.draws / 2) / total(o);
    const byName = (a: OpponentRecord, b: OpponentRecord) => a.name.localeCompare(b.name, 'pt-BR');
    const compare: Record<OpponentSort, (a: OpponentRecord, b: OpponentRecord) => number> = {
      games: (a, b) => total(b) - total(a) || byName(a, b),
      recent: (a, b) => b.lastDate.localeCompare(a.lastDate) || byName(a, b),
      oldest: (a, b) => a.lastDate.localeCompare(b.lastDate) || byName(a, b),
      name: byName,
      wins: (a, b) => b.wins - a.wins || total(b) - total(a) || byName(a, b),
      losses: (a, b) => b.losses - a.losses || total(b) - total(a) || byName(a, b),
      percent: (a, b) => percent(b) - percent(a) || total(b) - total(a) || byName(a, b),
    };
    return [...opponents].sort(compare[opponentSort]);
  }, [opponents, opponentSort]);

  const byTournament = useMemo(() => {
    const map = new Map<string, { first: HGame; games: HGame[] }>();
    for (const g of games) {
      const t = map.get(g.tournamentId) ?? { first: g, games: [] };
      t.games.push(g);
      map.set(g.tournamentId, t);
    }
    return [...map.values()].sort(
      (a, b) => b.first.date.localeCompare(a.first.date) || a.first.tournamentName.localeCompare(b.first.tournamentName, 'pt-BR'),
    );
  }, [games]);

  const detailGames = useMemo(() => {
    if (detail !== 'win' && detail !== 'draw' && detail !== 'loss' && detail !== 'pgn') return [];
    return games
      .filter((g) => (detail === 'pgn' ? g.hasPgn : g.outcome === detail))
      .sort((a, b) => b.date.localeCompare(a.date) || b.tournamentId.localeCompare(a.tournamentId) || a.round - b.round);
  }, [games, detail]);

  const pgnCount = games.filter((g) => g.hasPgn).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <Stat label="Torneios" value={byTournament.length} active={detail === 'tournaments'} onClick={() => toggleDetail('tournaments')} />
        <Stat label="Partidas" value={stats.played} href="#partidas" />
        <Stat label="Vitórias" value={stats.wins} className="text-brand-600 dark:text-brand-400" active={detail === 'win'} onClick={() => toggleDetail('win')} />
        <Stat label="Empates" value={stats.draws} className="text-gray-600 dark:text-gray-300" active={detail === 'draw'} onClick={() => toggleDetail('draw')} />
        <Stat label="Derrotas" value={stats.losses} className="text-red-600 dark:text-red-400" active={detail === 'loss'} onClick={() => toggleDetail('loss')} />
        <Stat label="Com lances" value={pgnCount} active={detail === 'pgn'} onClick={pgnCount > 0 ? () => toggleDetail('pgn') : undefined} />
        <Stat label="Aproveitamento" value={stats.played ? `${numberLabel(stats.pct)}%` : '—'} />
      </div>
      {stats.forfeits > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-5">
          + {stats.forfeits} {stats.forfeits === 1 ? 'partida' : 'partidas'} por W.O., fora das estatísticas.
        </p>
      )}

      {detail && (
        <section id="detalhe" className="card p-4 sm:p-6" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold text-brand-700 dark:text-brand-400">
              {detail === 'tournaments'
                ? `Torneios (${byTournament.length})`
                : `${detail === 'win' ? 'Vitórias' : detail === 'draw' ? 'Empates' : detail === 'loss' ? 'Derrotas' : 'Partidas com lances'} (${detailGames.length})`}
            </h2>
            <button type="button" onClick={() => setDetail(null)} className="shrink-0 py-1 text-sm font-medium text-brand-700 dark:text-brand-300 underline underline-offset-2">
              fechar
            </button>
          </div>

          {detail === 'tournaments' ? (
            <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800/60">
              {byTournament.map(({ first, games: tg }) => {
                const rec = { wins: 0, draws: 0, losses: 0 };
                for (const g of tg) if (wasPlayed(g)) bump(rec, g);
                const n = rec.wins + rec.draws + rec.losses;
                return (
                  <li key={first.tournamentId} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={tournamentHref(first)} className="min-w-0 font-medium hover:underline break-words">
                        {first.tournamentName}
                      </Link>
                      <p className="shrink-0 text-sm font-semibold whitespace-nowrap" title="Vitórias / Empates / Derrotas">
                        <span className="text-brand-600 dark:text-brand-400">{rec.wins}</span> /{' '}
                        <span className="text-gray-600 dark:text-gray-300">{rec.draws}</span> /{' '}
                        <span className="text-red-600 dark:text-red-400">{rec.losses}</span>
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(first.date)}
                      {first.timeControl && ` · ${first.timeControl}`}
                      {first.homologated === true && ' · ✅ homologado'}
                      {first.homologated === false && ' · não homologado'}
                      {` · ${n} ${n === 1 ? 'partida' : 'partidas'}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800/60">
                {detailGames.slice(0, detailLimit).map((g) => (
                  <li key={g.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <OpponentName g={g} className="font-medium hover:underline break-words" />
                      {detail === 'pgn' && (
                        <span className={cn('shrink-0 text-xs font-semibold', OUTCOME_CLASS[g.outcome])}>{OUTCOME_LABEL[g.outcome]}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <Link href={tournamentHref(g)} className="hover:underline">{g.tournamentName}</Link>
                      {` · ${formatDate(g.date)} · Rodada ${g.round}${g.groupName ? ` (${g.groupName})` : ''} · ${g.color === 'white' ? '♔ Brancas' : '♚ Pretas'}`}
                      {g.timeControl && ` · ${g.timeControl}`}
                    </p>
                    {g.hasPgn && <GameViewerButton game={viewable(g)} orientation={g.color} />}
                  </li>
                ))}
              </ul>
              {detailGames.length > detailLimit && (
                <button
                  type="button"
                  onClick={() => setDetailLimit((n) => n + DETAIL_PAGE)}
                  className="mt-3 w-full rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                >
                  mostrar mais ({detailGames.length - detailLimit} restantes)
                </button>
              )}
            </>
          )}
        </section>
      )}

      {opponents.length > 0 && (
        <section className="card p-4 sm:p-6">
          <h2 className="text-xl font-bold text-brand-700 dark:text-brand-400 mb-3">Adversários ({opponents.length})</h2>
          <Select label="Ordenar por" value={opponentSort} onChange={(e) => setOpponentSort(e.target.value as OpponentSort)}>
            {OPPONENT_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 mb-2">V / E / D = vitórias, empates e derrotas</p>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {sortedOpponents.map((o) => {
              const open = openOpponents.has(o.key);
              const total = o.wins + o.draws + o.losses;
              return (
                <li key={o.key} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {o.id ? (
                        <Link href={`/players/${o.id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline break-words">{o.name}</Link>
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-gray-100 break-words">{o.name}</span>
                      )}
                      {o.cbxId && <span className="block text-xs text-gray-400">CBX {o.cbxId}</span>}
                    </div>
                    <p className="shrink-0 text-sm font-semibold whitespace-nowrap" title="Vitórias / Empates / Derrotas">
                      <span className="text-brand-600 dark:text-brand-400">{o.wins}</span> /{' '}
                      <span className="text-gray-600 dark:text-gray-300">{o.draws}</span> /{' '}
                      <span className="text-red-600 dark:text-red-400">{o.losses}</span>
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{total} {total === 1 ? 'jogo' : 'jogos'}</span>
                    <span>Último: {formatDate(o.lastDate)}</span>
                    <button
                      type="button"
                      onClick={() => toggleOpponent(o.key)}
                      aria-expanded={open}
                      className="py-1 text-xs font-medium text-brand-700 dark:text-brand-300 underline underline-offset-2"
                    >
                      {open ? 'ocultar jogos' : 'ver jogos'}
                    </button>
                  </div>
                  {open && (
                    <ul className="mt-3 space-y-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
                      {o.games.map((g) => (
                        <li key={g.id} className="text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <Link href={tournamentHref(g)} className="min-w-0 font-medium hover:underline break-words">{g.tournamentName}</Link>
                            <span className={cn('shrink-0 text-xs font-semibold', OUTCOME_CLASS[g.outcome])}>{OUTCOME_LABEL[g.outcome]}</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(g.date)} · Rodada {g.round} · {g.color === 'white' ? '♔ Brancas' : '♚ Pretas'}
                            {g.timeControl && ` · ${g.timeControl}`}
                          </p>
                          {g.hasPgn && <GameViewerButton game={viewable(g)} orientation={g.color} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section id="partidas" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-bold text-brand-700 dark:text-brand-400">Partidas por torneio</h2>
        {byTournament.map(({ first, games: tg }) => (
          <div key={first.tournamentId} className="card p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <Link href={tournamentHref(first)} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">
                {first.tournamentName}
              </Link>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(first.date)}
                {first.timeControl && ` · ${first.timeControl}`}
                {first.homologated === true && ' · ✅ homologado'}
                {first.homologated === false && ' · não homologado'}
              </span>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {[...tg].sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? '') || a.round - b.round).map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-8 shrink-0">R{g.round}</span>
                    <span title={g.color === 'white' ? 'Brancas' : 'Pretas'} className="shrink-0">{g.color === 'white' ? '♔' : '♚'}</span>
                    <OpponentName g={g} className="truncate hover:underline" />
                    {g.opp.rating ? <span className="text-xs text-gray-400 shrink-0">({g.opp.rating})</span> : null}
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    {g.hasPgn && <GameViewerButton game={viewable(g)} orientation={g.color} />}
                    <span className={cn('text-xs font-semibold', OUTCOME_CLASS[g.outcome])}>{OUTCOME_LABEL[g.outcome]}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function OpponentName({ g, className }: { g: HGame; className?: string }) {
  return g.opp.id ? (
    <Link href={`/players/${g.opp.id}`} className={className}>{g.opp.name}</Link>
  ) : (
    <span className={className}>{g.opp.name}</span>
  );
}

function Stat({
  label, value, className, onClick, href, active,
}: {
  label: string;
  value: number | string;
  className?: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <p className={cn('text-2xl font-bold text-gray-900 dark:text-gray-100', className)}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </>
  );
  const base = 'card px-4 py-3 text-center';
  const interactive = 'block w-full transition-colors hover:border-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600';
  const hint = 'text-[11px] font-medium text-brand-700 dark:text-brand-300 underline underline-offset-2';
  if (href) {
    return (
      <a href={href} className={cn(base, interactive)}>
        {body}
        <span className={hint}>ver partidas</span>
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={!!active}
        aria-controls="detalhe"
        className={cn(base, interactive, active && 'border-brand-600 bg-brand-50 dark:bg-brand-950')}
      >
        {body}
        <span className={hint}>{active ? 'ocultar' : 'ver detalhes'}</span>
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
