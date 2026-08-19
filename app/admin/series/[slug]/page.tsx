import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { describeDimensions, formatSeriesPeriod } from '@/lib/utils/series';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';

export default async function AdminSeriesOverview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: series } = await supabase
    .from('tournament_series').select('*').eq('slug', slug).single();
  if (!series) notFound();

  const [{ data: stages }, { data: rules }, { data: scopes }] = await Promise.all([
    supabase
      .from('series_tournaments')
      .select('label, sort_order, tournament:tournaments(slug, name, status, start_date)')
      .eq('series_id', series.id)
      .order('sort_order'),
    supabase.from('series_points_rules').select('place, points')
      .eq('series_id', series.id).order('place'),
    supabase.rpc('get_series_scopes', { p_series_id: series.id }),
  ]);

  const finished = (stages ?? []).filter((s: any) => s.tournament?.status === 'finished').length;
  const base = `/admin/series/${slug}`;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="card p-5 space-y-2">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">A série</h2>
        {series.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
            {series.description}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Field label="Período" value={formatSeriesPeriod(series.start_date, series.end_date)} />
          <Field label="Local" value={[series.city, series.state].filter(Boolean).join(', ') || '—'} />
          <Field label="Organizador" value={series.organizer_name ?? '—'} />
          <Field
            label="Classifica por"
            value={
              describeDimensions(series.classification_dimensions) +
              (series.has_absolute_classification ? ' + absoluto' : '')
            }
          />
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          href={`${base}/etapas`}
          label="Etapas"
          value={String(stages?.length ?? 0)}
          hint={`${finished} já pontuando`}
        />
        <Stat
          href={`${base}/pontuacao`}
          label="Regras de pontos"
          value={String(rules?.length ?? 0)}
          hint={rules?.length ? `1º = ${rules[0].points} pts` : 'nenhuma cadastrada'}
        />
        <Stat
          href={`${base}/classificacao`}
          label="Rankings"
          value={String(scopes?.length ?? 0)}
          hint="absoluto + faixas"
        />
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Etapas</h2>
          <Link href={`${base}/etapas`} className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            Gerenciar
          </Link>
        </div>
        {!stages?.length ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum torneio vinculado ainda. Só etapa <strong>encerrada</strong> distribui pontos.
          </p>
        ) : (
          <ul className="space-y-2">
            {stages.map((s: any, i: number) => (
              <li key={s.tournament?.slug ?? i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-400 dark:text-gray-500 tabular-nums">{i + 1}.</span>
                <Link
                  href={`/admin/tournaments/${s.tournament?.slug}`}
                  className="font-medium text-gray-900 hover:underline dark:text-gray-100"
                >
                  {s.label || s.tournament?.name}
                </Link>
                <Badge className={getTournamentStatusColor(s.tournament?.status, null, true)}>
                  {getTournamentStatusLabel(s.tournament?.status, null, true)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}

function Stat({ href, label, value, hint }: { href: string; label: string; value: string; hint: string }) {
  return (
    <Link href={href} className="card p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
    </Link>
  );
}
