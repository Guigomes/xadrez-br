'use client';

import Link from 'next/link';
import { useTournament, useTournamentRounds } from '@/lib/hooks/use-tournament';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { ROUND_STATUS_COLORS, ROUND_STATUS_LABELS } from '@/lib/utils/chess';
import { summarizeRounds } from '@/lib/utils/rounds';
import { formatDate } from '@/lib/utils/date';

/**
 * Lista de rodadas do torneio — client component, usado tanto pelo público
 * (app/tournaments/[slug]/rounds) quanto pela visão do organizador de
 * torneio IMPORTADO (app/admin/tournaments/[slug]/rounds). Torneio
 * importado é espelho do chess-results.com: o organizador não pareia nem
 * lança resultado por aqui, então a visão dele não precisa (e não deve) ser
 * diferente da pública — é o mesmo dado, só que dentro do painel admin.
 *
 * Client (não Server Component) de propósito: a página admin que a monta
 * precisa ficar 'use client' por causa dos botões de status do torneio, e um
 * Server Component (que usa next/headers) não pode ser importado dentro de
 * um Client Component — só o inverso. Mesmo padrão de standings-view.tsx.
 *
 * `basePath` monta o link de cada rodada (`${basePath}/${numero}`) — público
 * usa `/tournaments/{slug}/rounds`, admin usa `/admin/tournaments/{slug}/rounds`.
 */
export function RoundsList({ slug, basePath }: { slug: string; basePath: string }) {
  const { data: tournament, isLoading: loadingTournament } = useTournament(slug);
  const { data: rounds, isLoading: loadingRounds } = useTournamentRounds(tournament?.id ?? '');

  if (loadingTournament || (!!tournament && loadingRounds)) return <PageSpinner />;
  if (!tournament) return <p className="text-sm text-gray-500 dark:text-gray-400">Torneio não encontrado.</p>;

  if (!rounds?.length) {
    return <EmptyState icon="📋" title="Nenhuma rodada criada" description="As rodadas serão publicadas pelo organizador." />;
  }

  // Group by round_number so multi-group tournaments show one card per round,
  // not one card per (round × pairing group) combination. Draft rounds ficam
  // de fora — rascunho não é "rodada que já aconteceu" nem pro público nem
  // pro organizador de torneio importado (que não pareia por aqui mesmo).
  const { rounds: items } = summarizeRounds(rounds);

  return (
    <div className="space-y-3">
      {items.map((round) => (
        <Link
          key={round.roundNumber}
          href={`${basePath}/${round.roundNumber}`}
          className="card flex items-center justify-between gap-4 p-4 hover:shadow-sm hover:border-brand-200 dark:hover:border-brand-800 transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${ROUND_STATUS_COLORS[round.status]}`}>
              {round.roundNumber}
            </span>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                Rodada {round.roundNumber}
              </p>
              {round.publishedAt && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatDate(round.publishedAt, "dd/MM 'às' HH:mm")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={ROUND_STATUS_COLORS[round.status]}>
              {round.status === 'ongoing' && (
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              {ROUND_STATUS_LABELS[round.status]}
            </Badge>
            <svg className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}
