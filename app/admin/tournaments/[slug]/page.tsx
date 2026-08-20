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
    <div className="grid gap-6 md:grid-cols-3">
      {/* Card de detalhes — metadados agrupados em grid, ícones na cor da marca */}
      <div className="md:col-span-3 card p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Detalhes</h2>
          <Link
            href={`${base}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 shrink-0"
          >
            <Icon path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            Editar torneio
          </Link>
        </div>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {(tournament.venue || tournament.city) && (
            <InfoItem
              label="Local"
              value={[tournament.venue, tournament.city && `${tournament.city}, ${tournament.state}`].filter(Boolean).join(' · ')}
              icon="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          )}
          <InfoItem
            label="Data"
            value={`${formatDateRange(tournament.start_date, tournament.end_date)}${tournament.start_time ? ` às ${tournament.start_time.slice(0, 5)}` : ''}`}
            icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
          <InfoItem label="Ritmo" value={tournament.time_control} icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          <InfoItem label="Rodadas" value={`${tournament.rounds_count} rodadas`} icon="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          <InfoItem
            label="Sistema"
            value={tournament.tournament_type === 'swiss' ? 'Suíço' : 'Round robin'}
            icon="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
          />
          <InfoItem label="Organização" value={tournament.organizer_name} icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          {tournament.chief_arbiter && (
            <InfoItem label="Árbitro-chefe" value={tournament.chief_arbiter} icon="M12 3v18m0-18l7 3m-7-3L5 6m0 0l-3 7a3 3 0 006 0L5 6zm14 0l-3 7a3 3 0 006 0l-3-7zM4 21h16" />
          )}
        </dl>
      </div>

      {/* Left column */}
      <div className="md:col-span-2 space-y-6">
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
          {/* Sem "Editar" próprio: o card Detalhes acima já leva pra mesma
              tela (/edit), e dois links pro mesmo lugar na mesma página só
              confundem. */}
          <div className="mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Classificações {sortedCategories.length > 0 && `(${sortedCategories.length})`}
            </h2>
          </div>
          {sortedCategories.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nenhuma classificação — o torneio premia só o Absoluto. Dá pra criar faixas em “Editar torneio”, no card Detalhes.
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

/** Ícone outline monocromático, stroke=currentColor. */
function Icon({ path, className = 'h-4 w-4' }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} />
    </svg>
  );
}

/** Linha do card de detalhes: ícone + rótulo pequeno + valor. */
function InfoItem({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400">
        <Icon path={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-gray-400 dark:text-gray-500">{label}</dt>
        <dd className="text-sm text-gray-800 dark:text-gray-200 break-words">{value}</dd>
      </div>
    </div>
  );
}
