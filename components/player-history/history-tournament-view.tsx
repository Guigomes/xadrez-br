'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  useHistoryGames,
  useHistoryPgnIds,
  useHistoryTournament,
  useHistoryTournamentPlayers,
} from '@/lib/hooks/use-player-history';
import { useUser } from '@/lib/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { GameViewerButton, RESULT_TEXT } from '@/components/player-history/game-viewer';
import { formatDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { numberLabel } from '@/lib/player-history/types';

const KIND_LABEL: Record<string, string> = { classical: 'Clássico', rapid: 'Rápido', blitz: 'Blitz', bullet: 'Bullet' };

export function HistoryTournamentView({ slug }: { slug: string }) {
  const { data: t, isLoading } = useHistoryTournament(slug);
  const { data: players } = useHistoryTournamentPlayers(t?.id);
  const { data: games } = useHistoryGames(t?.id);
  const { user } = useUser();
  const { data: pgnIds } = useHistoryPgnIds(t?.id, !!user && (t?.pgn_count ?? 0) > 0);
  const [group, setGroup] = useState('');
  const [round, setRound] = useState('');
  const [onlyPgn, setOnlyPgn] = useState(false);

  const groups = t?.groups ?? [];
  const rounds = useMemo(() => [...new Set((games ?? []).map((g) => g.round))].sort((a, b) => a - b), [games]);

  const shownPlayers = useMemo(() => (players ?? []).filter((p) => !group || p.group_name === group), [players, group]);
  const shownGames = useMemo(
    () =>
      (games ?? []).filter(
        (g) => (!group || g.group_name === group) && (!round || g.round === Number(round)) && (!onlyPgn || pgnIds?.has(g.id)),
      ),
    [games, group, round, onlyPgn, pgnIds],
  );
  const pgnShown = (games ?? []).filter((g) => (!group || g.group_name === group) && pgnIds?.has(g.id)).length;

  if (isLoading) return <PageSpinner />;
  if (!t) {
    return (
      <div className="container-app py-16">
        <EmptyState
          icon="🔍"
          title="Torneio não encontrado"
          action={<Link href="/historico" className="text-sm text-brand-600 underline">Voltar ao histórico</Link>}
        />
      </div>
    );
  }

  const byRound = new Map<string, typeof shownGames>();
  for (const g of shownGames) {
    const key = `${g.group_name ?? ''}|${g.round}`;
    byRound.set(key, [...(byRound.get(key) ?? []), g]);
  }

  return (
    <div className="container-app py-8 space-y-8">
      <div>
        <Link href="/historico" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">← Histórico</Link>
        <h1 className="text-2xl font-bold text-brand-700 dark:text-brand-400 mt-2 break-words">{t.name}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {formatDate(t.start_date)}{t.date_approx ? ' (data aproximada)' : ''}
          {KIND_LABEL[t.time_control_kind] && ` · ${KIND_LABEL[t.time_control_kind]}`}
          {t.homologated === true && ' · ✅ homologado'}
          {t.homologated === false && ' · não homologado'}
          {t.city && ` · ${t.city}${t.state ? `/${t.state}` : ''}`}
          {t.organizer_name && ` · ${t.organizer_name}`}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{t.players_count} jogadores</Badge>
          <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{t.games_count} partidas</Badge>
          <Badge className={t.pgn_count > 0 ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500'}>
            {t.pgn_count > 0 ? `♟ ${t.pgn_count} de ${t.games_count} com lances` : 'sem lances (PGN) publicados'}
          </Badge>
        </div>
        {t.source_url && (
          <a href={t.source_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-sm text-brand-700 dark:text-brand-300 hover:underline">
            Ver no chess-results ↗
          </a>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 max-w-2xl">
          Torneio do arquivo histórico: só as partidas jogadas. Rodadas com bye ou jogador sem par não aparecem, então os
          pontos abaixo podem ficar abaixo da classificação oficial.
        </p>
      </div>

      {groups.length > 1 && (
        <div className="max-w-xs">
          <Select label="Categoria" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Todas ({groups.length})</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </div>
      )}

      <section className="card p-4 sm:p-6">
        <h2 className="text-xl font-bold text-brand-700 dark:text-brand-400">Jogadores ({shownPlayers.length})</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">Pontos nas partidas jogadas</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Jogador</th>
                {groups.length > 1 && !group && <th className="py-2 pr-3 font-medium">Categoria</th>}
                <th className="py-2 pr-3 font-medium text-right">Pts</th>
                <th className="py-2 pr-3 font-medium text-right" title="Partidas">P</th>
                <th className="py-2 pr-3 font-medium text-right" title="Vitórias">V</th>
                <th className="py-2 pr-3 font-medium text-right" title="Empates">E</th>
                <th className="py-2 font-medium text-right" title="Derrotas">D</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {shownPlayers.map((p, i) => (
                <tr key={`${p.player_id ?? p.player_name}|${p.group_name}`}>
                  <td className="py-2 pr-3 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-3">
                    {p.player_id ? (
                      <Link href={`/players/${p.player_id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">{p.player_name}</Link>
                    ) : (
                      <span className="font-medium text-gray-900 dark:text-gray-100">{p.player_name}</span>
                    )}
                  </td>
                  {groups.length > 1 && !group && <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{p.group_name}</td>}
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">{numberLabel(p.points)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{p.games}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-brand-600 dark:text-brand-400">{p.wins}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.draws}</td>
                  <td className="py-2 text-right tabular-nums text-red-600 dark:text-red-400">{p.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-brand-700 dark:text-brand-400">Partidas ({shownGames.length})</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <Select label="Rodada" value={round} onChange={(e) => setRound(e.target.value)}>
              <option value="">Todas</option>
              {rounds.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          {t.pgn_count > 0 && user && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pb-2">
              <input type="checkbox" checked={onlyPgn} onChange={(e) => setOnlyPgn(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Só partidas com lances ({pgnShown})
            </label>
          )}
        </div>
        {t.pgn_count > 0 && !user && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔒 Esta página tem lances de {t.pgn_count} partidas.{' '}
            <Link href="/login" className="text-brand-700 dark:text-brand-300 underline">Entre na sua conta</Link> para ver.
          </p>
        )}

        {[...byRound.entries()].map(([key, list]) => {
          const [grp, rd] = key.split('|');
          return (
            <div key={key} className="card p-4 sm:p-6">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Rodada {rd}{grp ? ` · ${grp}` : ''}
              </h3>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {list.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
                    <div className="min-w-0 flex items-center gap-2">
                      <PlayerLink id={g.white_player_id} name={g.white_name} />
                      <span className="text-gray-400 text-xs shrink-0">x</span>
                      <PlayerLink id={g.black_player_id} name={g.black_name} />
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      {pgnIds?.has(g.id) && (
                        <GameViewerButton
                          game={{ source: 'history', gameId: g.id, whiteName: g.white_name, blackName: g.black_name, resultText: RESULT_TEXT[g.result] ?? g.result, round: g.round, tournamentName: t.name }}
                        />
                      )}
                      <span className={cn('text-xs font-semibold tabular-nums', g.result === '1/2-1/2' ? 'text-gray-600 dark:text-gray-300' : 'text-gray-900 dark:text-gray-100')}>
                        {RESULT_TEXT[g.result] ?? g.result}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function PlayerLink({ id, name }: { id: string | null; name: string }) {
  return id ? (
    <Link href={`/players/${id}`} className="truncate hover:underline">{name}</Link>
  ) : (
    <span className="truncate">{name}</span>
  );
}
