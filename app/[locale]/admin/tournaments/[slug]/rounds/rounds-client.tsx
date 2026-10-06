'use client';

import { Suspense } from 'react';
import { useTournament } from '@/lib/hooks/use-tournament';
import { PageSpinner } from '@/components/ui/spinner';
import { NativeRounds } from '@/components/admin/native-rounds';
import { RoundsList } from '@/components/tournament/rounds-list';

export function AdminRoundsClient({ slug }: { slug: string }) {
  const { data: tournament, isLoading } = useTournament(slug);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  // Torneio nativo: fluxo de pareamento próprio (F4) no lugar das importações.
  if ((tournament as any).mode === 'native') {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Rodadas e pareamento</p>
        {/* Suspense obrigatório: NativeRounds lê ?round= via useSearchParams
            (pra reabrir o card certo ao voltar do painel de resultados), e sem
            a fronteira o build de produção recusa a página. */}
        <Suspense fallback={<PageSpinner />}>
          <NativeRounds tournament={tournament} />
        </Suspense>
      </div>
    );
  }

  // Torneio importado sem rodada em andamento (nenhuma publicada ainda, ou
  // torneio encerrado): mesma lista que o público vê. Com rodada atual, page.tsx
  // já redirecionou direto pra ela, igual ao público.
  return (
    <div className="max-w-3xl">
      <RoundsList slug={slug} basePath={`/admin/tournaments/${slug}/rounds`} />
    </div>
  );
}
