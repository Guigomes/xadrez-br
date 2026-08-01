'use client';

import { use } from 'react';
import Link from 'next/link';
import { useTournament, useTournamentPlayers, useTournamentRounds } from '@/lib/hooks/use-tournament';
import { useCategories } from '@/lib/hooks/use-classifications';
import { useGroups } from '@/lib/hooks/use-native-rounds';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ROUND_STATUS_LABELS, ROUND_STATUS_COLORS } from '@/lib/utils/chess';
import { formatDateRange } from '@/lib/utils/date';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Aba "Visão geral" do admin — mesmo padrão visual da visão geral pública
 * (app/tournaments/[slug]/page.tsx: meta info, rodada atual, progresso de
 * rodadas, grupos/categorias, sobre o torneio), só que com links pro próprio
 * admin em vez das rotas públicas. A aba "Editar" saiu da navegação — chega-se
 * a ela só pelo botão "Editar torneio" aqui.
 */
export default function AdminTournamentOverviewPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading: loadingTournament } = useTournament(slug);
  const tournamentId = tournament?.id ?? '';
  const { data: categories } = useCategories(tournamentId);
  const { data: groups } = useGroups(tournamentId);
  const { data: players } = useTournamentPlayers(tournamentId);
  const { data: rounds, isLoading: loadingRounds } = useTournamentRounds(tournamentId);

  if (loadingTournament || loadingRounds) return <PageSpinner />;
  if (!tournament) return <p className="text-red-500">Torneio não encontrado.</p>;

  const base = `/admin/tournaments/${slug}`;

  // Dedupe por round_number — torneio com grupo tem uma linha de `rounds`
  // por grupo; sem isso, 10 grupos x 6 rodadas pareceria 60. Uma rodada só
  // conta "finalizada" quando todos os grupos terminaram ela. Mesmo critério
  // de app/tournaments/[slug]/page.tsx (visão geral pública).
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

  // Mesmo critério de ordenação da visão geral pública: número da faixa
  // etária embutido no nome (SUB7 < SUB9 < SUB11…), depois alfabético.
  const groupList = [...(groups ?? [])].sort((a, b) => {
    const nA = parseInt(a.name.match(/\d+/)?.[0] ?? '999', 10);
    const nB = parseInt(b.name.match(/\d+/)?.[0] ?? '999', 10);
    return nA !== nB ? nA - nB : a.name.localeCompare(b.name);
  });
  const hasGroups = groupList.length > 0;
  const pairingIncomplete = tournament.pairing_mode === 'custom' && !hasGroups;

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

        {pairingIncomplete && (
          <div className="card p-4 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">⚠ Emparceiramento personalizado incompleto</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Falta criar grupo ou mapear classificação — configure na aba{' '}
              <Link href={`${base}/groups`} className="underline">Emparceiramento</Link> antes de publicar.
            </p>
          </div>
        )}

        <Link
          href={`${base}/players`}
          className="card p-4 flex items-center justify-between gap-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">👥</span>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">Participantes</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{players?.length ?? 0} inscritos</p>
            </div>
          </div>
          <svg className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

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

        {hasGroups ? (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Grupos</h2>
              <Link href={`${base}/groups`} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Editar</Link>
            </div>
            <div className="flex flex-col gap-1">
              {groupList.map((g) => (
                <div key={g.id} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {g.name}
                </div>
              ))}
            </div>
          </div>
        ) : (categories?.length ?? 0) > 0 && (
          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Categorias</h2>
            <div className="flex flex-wrap gap-2">
              {(categories ?? []).map((cat) => (
                <Badge key={cat.id} className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                  {cat.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="card p-4 space-y-3 text-sm">
          <InfoRow label="Organização" value={tournament.organizer_name} />
          {tournament.chief_arbiter && <InfoRow label="Árbitro-chefe" value={tournament.chief_arbiter} />}
          {tournament.venue && <InfoRow label="Local" value={tournament.venue} />}
          <InfoRow label="Ritmo" value={tournament.time_control} />
          <InfoRow label="Sistema" value={tournament.tournament_type === 'swiss' ? 'Suíço' : 'Round robin'} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-gray-800 dark:text-gray-200 break-words">{value}</span>
    </div>
  );
}
