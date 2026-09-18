import { Suspense } from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { TournamentCard } from '@/components/tournament/tournament-card';
import { TournamentFilters } from '@/components/tournament/tournament-filters';
import { EmptyState } from '@/components/ui/empty-state';
import type { TournamentListItem, TournamentStatus } from '@/types/database';

export const metadata: Metadata = {
  title: 'Torneios',
  description: 'Encontre torneios de xadrez no Brasil: inscrições abertas, em andamento e encerrados.',
};

interface Props {
  searchParams: Promise<{ q?: string; uf?: string; status?: string }>;
}

/**
 * Era um client component: mandava HTML vazio, esperava hidratar e só então
 * disparava a busca — três esperas em série numa das telas de maior tráfego.
 * Agora a lista vem pronta no primeiro HTML (bom pro tempo até o conteúdo e
 * pro SEO); só os filtros continuam client, com o estado na URL.
 */
export default async function TournamentsPage({ searchParams }: Props) {
  const { q, uf, status } = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('search_tournaments', {
    p_query:  q || undefined,
    p_state:  uf || undefined,
    p_status: (status as TournamentStatus) || undefined,
    p_limit:  50,
    p_offset: 0,
  });

  const tournaments = (data ?? []) as TournamentListItem[];

  return (
    <div className="container-app py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Torneios</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Encontre torneios de xadrez no Brasil
        </p>
      </div>

      {/* useSearchParams exige Suspense em página renderizada no servidor. */}
      <Suspense fallback={<div className="grid gap-3 sm:grid-cols-3 mb-6 h-10" />}>
        <TournamentFilters />
      </Suspense>

      {error ? (
        <EmptyState icon="⚠️" title="Erro ao carregar torneios" description="Tente novamente em instantes." />
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nenhum torneio encontrado"
          description="Tente outros filtros ou aguarde novos torneios serem publicados."
        />
      ) : (
        <>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            {tournaments.length} torneio{tournaments.length !== 1 ? 's' : ''} encontrado{tournaments.length !== 1 ? 's' : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
