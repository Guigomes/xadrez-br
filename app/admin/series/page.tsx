import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser, getSessionProfile } from '@/lib/data/session';
import { Badge } from '@/components/ui/badge';
import {
  SERIES_STATUS_COLOR, SERIES_STATUS_LABEL, describeDimensions, formatSeriesPeriod,
} from '@/lib/utils/series';

export default async function AdminSeriesIndex() {
  const supabase = await createClient();

  // Memoizados pelo layout do admin (lib/data/session.ts) — sem round-trip aqui.
  const [user, profile] = await Promise.all([getSessionUser(), getSessionProfile()]);
  const canCreate = profile?.role === 'admin' || !!profile?.is_organizer;

  const { data: series } = await supabase
    .from('tournament_series')
    .select('id, slug, name, status, start_date, end_date, city, state, classification_dimensions')
    .eq('created_by', user!.id)
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Minhas séries</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Festivais e circuitos: vários torneios com uma classificação acumulada.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/admin/series/new"
            className="inline-flex items-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova série
          </Link>
        )}
      </div>

      {!series?.length ? (
        <div className="card p-10 text-center">
          <p className="text-4xl mb-3">🏅</p>
          <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Nenhuma série criada</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {canCreate
              ? 'Crie uma série para agrupar torneios e somar a pontuação entre eles.'
              : 'Ative "Organizador" em Minha conta para criar uma série.'}
          </p>
          {canCreate && (
            <Link
              href="/admin/series/new"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Criar série
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {series.map((s) => (
            <Link
              key={s.id}
              href={`/admin/series/${s.slug}`}
              className="card p-4 flex flex-col gap-1 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <div className="mb-1">
                <Badge className={SERIES_STATUS_COLOR[s.status]}>{SERIES_STATUS_LABEL[s.status]}</Badge>
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{s.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {[s.city, s.state].filter(Boolean).join(', ')}
                {s.city || s.state ? ' · ' : ''}
                {formatSeriesPeriod(s.start_date, s.end_date)} · classifica por{' '}
                {describeDimensions(s.classification_dimensions)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
