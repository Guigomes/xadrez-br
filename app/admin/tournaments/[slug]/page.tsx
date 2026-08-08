'use client';

import { use } from 'react';
import Link from 'next/link';
import { useTournament, useTournamentRounds } from '@/lib/hooks/use-tournament';
import { useCategories } from '@/lib/hooks/use-classifications';
import { useGroups } from '@/lib/hooks/use-native-rounds';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ROUND_STATUS_LABELS, ROUND_STATUS_COLORS, compareGroupNames } from '@/lib/utils/chess';
import { formatDateRange } from '@/lib/utils/date';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Aba "Visão geral" do admin — enxuta: dados do torneio numa faixa só no topo
 * (o cabeçalho compartilhado já mostra nome/situação), rodada em andamento,
 * sobre o torneio, progresso de rodadas e as classificações criadas.
 * Participantes, grupos e emparceiramento têm abas próprias — não se repetem
 * aqui como card.
 */
export default function AdminTournamentOverviewPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading: loadingTournament } = useTournament(slug);
  const tournamentId = tournament?.id ?? '';
  const { data: categories } = useCategories(tournamentId);
  const { data: groups } = useGroups(tournamentId);
  const { data: rounds, isLoading: loadingRounds } = useTournamentRounds(tournamentId);

  if (loadingTournament || loadingRounds) return <PageSpinner />;
  if (!tournament) return <p className="text-red-500">Torneio não encontrado.</p>;

  const base = `/admin/tournaments/${slug}`;

  // Dedupe por round_number — torneio com grupo tem uma linha de `rounds`
  // por grupo; sem isso, 10 grupos x 6 rodadas pareceria 60. Uma rodada só
  // conta "finalizada" quando todos os grupos terminaram ela.
  type RS = 'pending' | 'ongoing' | 'finished';
  const roundsByNumber = new Map<number, RS[]>();
  for (const r of rounds ?? []) {
    const list = roundsByNumber.get(r.round_number) ?? [];
    list.push(r.status as RS);
    roundsByNumber.set(r.round_number, list);
  }
  const aggregatedRounds = Array.from(roundsByNumber.entries())
    .map(([n, statuses]) => ({
      round_number: n,
      status: (statuses.every((s) => s === 'finished')
        ? 'finished'
        : statuses.some((s) => s === 'ongoing')
          ? 'ongoing'
          : 'pending') as RS,
    }))
    .sort((a, b) => a.round_number - b.round_number);

  const completedRounds = aggregatedRounds.filter((r) => r.status === 'finished').length;
  const currentRound = aggregatedRounds.find((r) => r.status === 'ongoing');

  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const sortedCategories = [...(categories ?? [])].sort((a, b) => compareGroupNames(a.name, b.name));
  const hasGroups = (groups?.length ?? 0) > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-3 -mt-2 mb-2">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {(tournament.venue || tournament.city) && (
            <span>📍 {[tournament.venue, `${tournament.city}, ${tournament.state}`].filter(Boolean).join(' · ')}</span>
          )}
          <span>
            📅 {formatDateRange(tournament.start_date, tournament.end_date)}
            {tournament.start_time && ` às ${tournament.start_time.slice(0, 5)}`}
          </span>
          <span>⏱ {tournament.time_control}</span>
          <span>🔄 {tournament.rounds_count} rodadas</span>
          <span>♟ {tournament.tournament_type === 'swiss' ? 'Suíço' : 'Round robin'}</span>
          <span>👤 {tournament.organizer_name}</span>
          {tournament.chief_arbiter && <span>⚖️ {tournament.chief_arbiter}</span>}
        </div>
        <Link
          href={`${base}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 shrink-0"
        >
          ⚙️ Editar torneio
        </Link>
      </div>

      {/* Left column */}
      <div className="lg:col-span-2 space-y-6">
        {currentRound && (
          <Link
            href={`${base}/rounds`}
            className="card p-4 flex items-center justify-between gap-4 bg-amber-50 border-amber-200 hover:border-amber-300 dark:bg-amber-950/20 dark:border-amber-900 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
              <div>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Rodada em andamento</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Rodada {currentRound.round_number}</p>
              </div>
            </div>
            <svg className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}

        {tournament.description && (
          <div className="card p-4 overflow-hidden">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Sobre o torneio</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed break-words whitespace-pre-wrap">
              {tournament.description}
            </p>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {aggregatedRounds.length > 0 && (
          <Link href={`${base}/rounds`} className="card p-4 block hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Rodadas ({completedRounds}/{tournament.rounds_count})
            </h2>
            <div className="flex flex-wrap gap-2">
              {aggregatedRounds.map((round) => (
                <span
                  key={round.round_number}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${ROUND_STATUS_COLORS[round.status]}`}
                  title={ROUND_STATUS_LABELS[round.status]}
                >
                  {round.round_number}
                </span>
              ))}
            </div>
          </Link>
        )}

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Classificações {sortedCategories.length > 0 && `(${sortedCategories.length})`}
            </h2>
            <Link href={`${base}/edit`} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Editar</Link>
          </div>
          {sortedCategories.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nenhuma classificação — o torneio premia só o Geral. Dá pra criar faixas na aba Editar.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sortedCategories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between gap-2">
                  <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                    {cat.name}
                  </Badge>
                  {hasGroups && (cat as any).pairing_group_id && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      → {groupName.get((cat as any).pairing_group_id) ?? 'grupo'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
