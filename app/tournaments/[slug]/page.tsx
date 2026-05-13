import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ROUND_STATUS_LABELS, ROUND_STATUS_COLORS, formatScore } from '@/lib/utils/chess';
import { formatDateRange } from '@/lib/utils/date';
import { Badge } from '@/components/ui/badge';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function TournamentOverviewPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  const [{ data: rounds }, { data: categories }, { data: topStandings }] = await Promise.all([
    supabase.from('rounds').select('*').eq('tournament_id', tournament.id).order('round_number'),
    supabase.from('tournament_categories').select('*').eq('tournament_id', tournament.id),
    supabase.rpc('get_tournament_standings', { p_tournament_id: tournament.id }),
  ]);

  const completedRounds = (rounds ?? []).filter((r) => r.status === 'finished').length;
  const currentRound = (rounds ?? []).find((r) => r.status === 'ongoing');

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Meta info — only shown on the overview page */}
      <div className="lg:col-span-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-2">
        {(tournament.venue || tournament.city) && (
          <span>📍 {[tournament.venue, `${tournament.city}, ${tournament.state}`].filter(Boolean).join(' · ')}</span>
        )}
        <span>📅 {formatDateRange(tournament.start_date, tournament.end_date)}</span>
        {tournament.registration_start_date && (
          <span>📝 Inscrições: {formatDateRange(tournament.registration_start_date, tournament.registration_end_date)}</span>
        )}
        <span>⏱ {tournament.time_control}</span>
        <span>🔄 {tournament.rounds_count} rodadas</span>
        {tournament.organizer_name && <span>👤 {tournament.organizer_name}</span>}
        {tournament.chief_arbiter && <span>⚖️ {tournament.chief_arbiter}</span>}
      </div>
      {/* Left column */}
      <div className="lg:col-span-2 space-y-6">
        {/* Current round highlight */}
        {currentRound && (
          <Link
            href={`/tournaments/${slug}/rounds/${currentRound.round_number}`}
            className="card p-4 flex items-center justify-between gap-4 bg-amber-50 border-amber-200 hover:border-amber-300 dark:bg-amber-950/20 dark:border-amber-900 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
              <div>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Rodada em andamento</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  Rodada {currentRound.round_number}
                </p>
              </div>
            </div>
            <svg className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}

        {/* Top standings preview */}
        {(topStandings?.length ?? 0) > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Classificação parcial</h2>
              <Link href={`/tournaments/${slug}/standings`} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                Ver completa
              </Link>
            </div>
            <div className="space-y-2">
              {(topStandings ?? []).map((row: any) => (
                <Link
                  key={row.tp_id}
                  href={`/tournaments/${slug}/players/${row.tp_id}`}
                  className="flex items-center gap-3 py-1.5 hover:opacity-80 transition-opacity"
                >
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0
                    ${row.rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                    ${row.rank === 2 ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : ''}
                    ${row.rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                    ${(row.rank ?? 0) > 3 ? 'text-gray-400' : ''}
                  `}>
                    {row.rank}
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{row.full_name}</span>
                  <span className="text-sm font-bold text-brand-600 dark:text-brand-400 tabular-nums">{formatScore(row.points)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {tournament.description && (
          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Sobre o torneio</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{tournament.description}</p>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {/* Rounds progress */}
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Rodadas ({completedRounds}/{tournament.rounds_count})
          </h2>
          <div className="flex flex-wrap gap-2">
            {(rounds ?? []).map((round) => (
              <Link
                key={round.id}
                href={`/tournaments/${slug}/rounds/${round.round_number}`}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition-colors
                  ${ROUND_STATUS_COLORS[round.status]}
                  hover:opacity-80
                `}
                title={ROUND_STATUS_LABELS[round.status]}
              >
                {round.round_number}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Finalizada
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Em andamento
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" /> Pendente
            </span>
          </div>
        </div>

        {/* Categories */}
        {(categories?.length ?? 0) > 0 && (
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

        {/* Info card */}
        <div className="card p-4 space-y-3 text-sm">
          <InfoRow label="Organização" value={tournament.organizer_name} />
          {tournament.chief_arbiter && <InfoRow label="Árbitro-chefe" value={tournament.chief_arbiter} />}
          {tournament.venue && <InfoRow label="Local" value={tournament.venue} />}
          <InfoRow label="Ritmo" value={tournament.time_control} />
          <InfoRow label="Sistema" value="Suíço" />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}
