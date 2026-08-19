import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import { formatDate } from '@/lib/utils/date';

export default async function SeriesOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: series } = await supabase
    .from('tournament_series')
    .select('id, name, description, points_outside_table')
    .eq('slug', slug)
    .single();
  if (!series) notFound();

  const [{ data: stages }, { data: rules }] = await Promise.all([
    supabase
      .from('series_tournaments')
      .select('label, sort_order, tournament:tournaments(slug, name, status, start_date, city, state)')
      .eq('series_id', series.id)
      .order('sort_order'),
    supabase.from('series_points_rules').select('place, points')
      .eq('series_id', series.id).order('place'),
  ]);

  return (
    <div className="space-y-5">
      {series.description && (
        <div className="card p-5">
          <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
            {series.description}
          </p>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">Etapas</h2>
        {!stages?.length ? (
          <EmptyState icon="🗓" title="Nenhuma etapa divulgada ainda" />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {stages.map((s: any, i: number) => (
              <li key={s.tournament?.slug ?? i} className="flex flex-wrap items-center gap-2 py-3">
                <span className="text-sm tabular-nums text-gray-400 dark:text-gray-500">{i + 1}.</span>
                <Link
                  href={`/tournaments/${s.tournament?.slug}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 hover:underline dark:text-gray-100"
                >
                  {s.label || s.tournament?.name}
                </Link>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {s.tournament?.start_date ? formatDate(s.tournament.start_date, 'dd/MM/yyyy') : ''}
                </span>
                <Badge className={getTournamentStatusColor(s.tournament?.status, null, true)}>
                  {getTournamentStatusLabel(s.tournament?.status, null, true)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!!rules?.length && (
        <div className="card p-5">
          <h2 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">Pontuação</h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Pontos que cada colocação vale em cada etapa encerrada.
            {series.points_outside_table > 0 &&
              ` Colocações fora desta tabela valem ${series.points_outside_table} ponto(s).`}
          </p>
          <div className="flex flex-wrap gap-2">
            {rules.map((r) => (
              <span
                key={r.place}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {r.place}º · <strong>{r.points}</strong> pts
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
