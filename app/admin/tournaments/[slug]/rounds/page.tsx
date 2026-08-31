'use client';

import { Suspense, use, useState } from 'react';
import { useTournament } from '@/lib/hooks/use-tournament';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { ImportStandings } from '@/components/admin/import-standings';
import { ImportPairings } from '@/components/admin/import-pairings';
import { NativeRounds } from '@/components/admin/native-rounds';
import { RoundsList } from '@/components/tournament/rounds-list';

interface Props {
  params: Promise<{ slug: string }>;
}

export default function AdminRoundsPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);

  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

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

  // Torneio importado: espelho do chess-results.com via cron-import (a cada
  // 2 min). O organizador não pareia nem lança resultado por aqui — editar
  // manualmente não tinha efeito nenhum além de ser sobrescrito no próximo
  // ciclo, então a visão vira a MESMA do público (components/tournament/
  // rounds-list.tsx), só dentro do painel admin. "Status do torneio" e os
  // importadores manuais continuam: são ação real (o primeiro não é tocado
  // pelo cron; o segundo só adianta a sincronização que já ia acontecer
  // sozinha, não finge um controle que não existe).
  async function handleTournamentStatus(newStatus: 'ongoing' | 'finished') {
    setStatusLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from('tournaments').update({ status: newStatus }).eq('id', tournament!.id);
      if (updErr) throw updErr;
      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? 'Erro ao atualizar status do torneio.');
      setStatusLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Rodadas</p>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Tournament status control */}
      {tournament.status !== 'ongoing' && tournament.status !== 'finished' && (
        <div className="card p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Status do torneio</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Inicie o torneio para que os participantes vejam a rodada atual em destaque.
            </p>
          </div>
          <Button
            onClick={() => handleTournamentStatus('ongoing')}
            disabled={statusLoading}
            className="shrink-0"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Iniciar torneio
          </Button>
        </div>
      )}
      {tournament.status === 'ongoing' && (
        <div className="card p-4 mb-6 flex items-center justify-between gap-4 flex-wrap border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/20">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">Torneio em andamento</span>
          </div>
          <button
            onClick={() => handleTournamentStatus('finished')}
            disabled={statusLoading}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Encerrar torneio
          </button>
        </div>
      )}

      <div className="mb-6 space-y-3">
        <ImportPairings slug={slug} />
        <ImportStandings slug={slug} />
      </div>

      {/* Mesmo componente que o público vê — ver comentário acima. */}
      <RoundsList slug={slug} basePath={`/admin/tournaments/${slug}/rounds`} />
    </div>
  );
}
