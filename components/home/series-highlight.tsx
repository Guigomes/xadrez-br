import { Link } from '@/i18n/navigation';
import { formatDate } from '@/lib/utils/date';
import { formatSeriesPeriod } from '@/lib/utils/series';

export interface HighlightSeries {
  slug: string;
  name: string;
  organizer_name: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  stages: { label: string | null; name: string; slug: string; start_date: string }[];
}

/**
 * Destaque de circuito/festival em andamento na home (série publicada cujo
 * período ainda não acabou). Mostra a próxima etapa e leva às etapas e à
 * classificação geral. Primeiro caso: Festival da Criança MS 2026 (FESMAX).
 */
export function SeriesHighlight({ series, today }: { series: HighlightSeries; today: string }) {
  const stages = [...series.stages].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const next = stages.find((s) => s.start_date >= today);
  const done = stages.filter((s) => s.start_date < today).length;

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 text-white shadow-lg sm:p-8">
      <span className="pointer-events-none absolute -right-4 -top-6 select-none text-[120px] leading-none text-white/15" aria-hidden="true">🏆</span>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/80">
        Circuito{series.state ? ` · ${series.state}` : ''}{series.organizer_name ? ` · ${series.organizer_name}` : ''}
      </p>
      <h2 className="mt-1 max-w-2xl text-xl font-bold leading-tight sm:text-2xl">{series.name}</h2>
      <p className="mt-2 text-sm text-white/90">
        {formatSeriesPeriod(series.start_date, series.end_date)}
        {stages.length > 0 && ` · ${stages.length} etapas${done ? `, ${done} realizada${done > 1 ? 's' : ''}` : ''}`}
      </p>
      {next && (
        <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 rounded-lg bg-white/15 px-3 py-2 text-sm">
          <span className="font-semibold">Próxima etapa:</span>
          <Link href={`/torneios/${next.slug}`} className="underline-offset-2 hover:underline">
            {next.label || next.name}
          </Link>
          <span className="text-white/80">· {formatDate(next.start_date, 'dd/MM')}</span>
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/series/${series.slug}/classificacao`}
          className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-orange-700 shadow-sm transition-colors hover:bg-orange-50"
        >
          Classificação geral
        </Link>
        <Link
          href={`/series/${series.slug}`}
          className="inline-flex items-center justify-center rounded-xl border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          Ver as etapas
        </Link>
      </div>
    </section>
  );
}
