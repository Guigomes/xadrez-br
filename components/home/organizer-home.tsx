import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import { formatDateRange } from '@/lib/utils/date';

/**
 * Home de quem está logado e é organizador (role=admin ou is_organizer). O
 * objetivo quase certo dessa pessoa ao abrir o site é gerenciar os próprios
 * torneios — mostrar a lista dela direto, em vez de uma landing de marketing
 * que ela já conhece, evita os dois cliques (menu → painel) do fluxo antigo.
 */

// Ordem de relevância pra quem administra: o que exige ação agora primeiro,
// arquivo (encerrado/cancelado) por último.
const STATUS_PRIORITY: Record<string, number> = {
  ongoing: 0,
  registration: 1,
  registration_closed: 2,
  published: 3,
  draft: 4,
  finished: 5,
  cancelled: 6,
};

const MAX_SHOWN = 6;

export async function OrganizerHome({ userId, userName }: { userId: string; userName: string | null }) {
  const supabase = await createClient();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, slug, name, status, start_date, end_date, registration_end_date, rounds_count, is_public, city, state, created_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  const all = tournaments ?? [];
  const ids = all.map((t) => t.id);

  // Inscrições pendentes por torneio — uma query só (evita N+1), agregada no
  // cliente. Só interessa como sinal de "tem gente esperando aprovação".
  const pendingByTournament = new Map<string, number>();
  if (ids.length > 0) {
    const { data: pending } = await supabase
      .from('tournament_registrations')
      .select('tournament_id')
      .in('tournament_id', ids)
      .eq('status', 'pending');
    for (const r of pending ?? []) {
      pendingByTournament.set(r.tournament_id, (pendingByTournament.get(r.tournament_id) ?? 0) + 1);
    }
  }

  const sorted = [...all].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 9;
    const pb = STATUS_PRIORITY[b.status] ?? 9;
    return pa - pb; // dentro do mesmo status mantém created_at desc da query
  });
  const shown = sorted.slice(0, MAX_SHOWN);
  const totalPending = [...pendingByTournament.values()].reduce((a, b) => a + b, 0);

  const firstName = userName?.trim().split(/\s+/)[0];

  return (
    <div className="container-app py-8 sm:py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {firstName ? `Olá, ${firstName}` : 'Meus torneios'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {all.length > 0
              ? 'Retome de onde parou ou comece um novo.'
              : 'Crie seu primeiro torneio para começar.'}
          </p>
        </div>
        <Link
          href="/admin/tournaments/new"
          className="inline-flex items-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo torneio
        </Link>
      </div>

      {totalPending > 0 && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400">
          {totalPending} inscriç{totalPending > 1 ? 'ões' : 'ão'} aguardando sua aprovação.
        </div>
      )}

      {all.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="mb-3 text-4xl">♟</p>
          <p className="mb-1 font-semibold text-gray-700 dark:text-gray-300">Nenhum torneio ainda</p>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Monte a estrutura uma vez e deixe o sistema cuidar de pareamento e classificação.
          </p>
          <Link
            href="/admin/tournaments/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Criar torneio
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((t) => {
              const pending = pendingByTournament.get(t.id) ?? 0;
              return (
                <Link
                  key={t.id}
                  href={`/admin/tournaments/${t.slug}`}
                  className="card flex flex-col gap-1 p-4 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge className={getTournamentStatusColor(t.status, t.registration_end_date)}>
                      {getTournamentStatusLabel(t.status, t.registration_end_date)}
                    </Badge>
                    {!t.is_public && t.status !== 'draft' && (
                      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Privado</Badge>
                    )}
                    {pending > 0 && (
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                        {pending} pendente{pending > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t.city}, {t.state} · {formatDateRange(t.start_date, t.end_date)} · {t.rounds_count} rodadas
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between text-sm">
            <Link href="/tournaments" className="text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400">
              Ver torneios públicos →
            </Link>
            {all.length > MAX_SHOWN && (
              <Link href="/admin" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                Ver todos os meus torneios ({all.length})
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
