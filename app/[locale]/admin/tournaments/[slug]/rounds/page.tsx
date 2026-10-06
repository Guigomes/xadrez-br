import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { PageSpinner } from '@/components/ui/spinner';
import { AdminRoundsClient } from './rounds-client';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ group?: string }>;
}

/**
 * Torneio importado é espelho do chess-results.com: o organizador não pareia nem
 * lança resultado, então a visão dele é a MESMA do público — inclusive abrir
 * direto na rodada atual (components/tournament/rounds-list.tsx é a lista de
 * quando não há rodada em andamento). Encerrar/iniciar o torneio mora no
 * cabeçalho do painel (admin-tournament-chrome.tsx); não duplicar aqui.
 * Torneio nativo segue com o fluxo de pareamento (NativeRounds).
 */
export default async function AdminRoundsPage({ params, searchParams }: Props) {
  const [{ slug }, { group }] = await Promise.all([params, searchParams]);
  const data = await getTournamentPageData(slug);

  if (data?.tournament.mode === 'imported' && data.currentRoundNumber) {
    const groupQuery = group ? `?group=${encodeURIComponent(group)}` : '';
    redirect(`/admin/tournaments/${slug}/rounds/${data.currentRoundNumber}${groupQuery}`);
  }

  // Suspense: RoundsList/NativeRounds leem searchParams no client.
  return (
    <Suspense fallback={<PageSpinner />}>
      <AdminRoundsClient slug={slug} />
    </Suspense>
  );
}
