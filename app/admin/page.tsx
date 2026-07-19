import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import { formatDateRange } from '@/lib/utils/date';

export default async function AdminDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, slug, name, status, start_date, end_date, registration_end_date, rounds_count, is_public, city, state')
    .eq('created_by', user!.id)
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meus torneios</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/stats"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Estatísticas
          </Link>
          <Link
            href="/admin/tournaments/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo torneio
          </Link>
        </div>
      </div>

      {(!tournaments?.length) ? (
        <div className="card p-10 text-center">
          <p className="text-4xl mb-3">♟</p>
          <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Nenhum torneio criado</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Crie seu primeiro torneio para começar.</p>
          <Link
            href="/admin/tournaments/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Criar torneio
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <div key={t.id} className="card p-4 flex flex-col gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge className={getTournamentStatusColor(t.status, t.registration_end_date)}>{getTournamentStatusLabel(t.status, t.registration_end_date)}</Badge>
                  {!t.is_public && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Rascunho</Badge>}
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t.city}, {t.state} · {formatDateRange(t.start_date, t.end_date)} · {t.rounds_count} rodadas
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/tournaments/${t.slug}/registrations`}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Inscrições
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/players`}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Participantes
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/rounds`}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Rodadas
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/edit`}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Editar
                </Link>
                <Link
                  href={`/tournaments/${t.slug}`}
                  target="_blank"
                  className="rounded-lg bg-brand-50 dark:bg-brand-950/50 px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-100 transition-colors"
                >
                  Ver
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
