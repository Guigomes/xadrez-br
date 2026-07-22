'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useTournament } from '@/lib/hooks/use-tournament';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { AuditLogEntry } from '@/types/database';

const ACTION_LABELS: Record<string, string> = {
  generate_round: 'Pareamento gerado',
  publish_round: 'Rodada publicada',
  finish_round: 'Rodada encerrada',
  reopen_round: 'Rodada reaberta',
  set_result: 'Resultado lançado',
  swap_pairing: 'Mesas alteradas manualmente',
  generate_initial_ranking: 'Ranking inicial gerado',
  approve_registration: 'Inscrição aprovada',
};

export default function AdminHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);

  const { data: entries, isLoading: loadingLog } = useQuery({
    queryKey: ['audit-log', tournament?.id],
    enabled: !!tournament?.id,
    queryFn: async (): Promise<AuditLogEntry[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('audit_log').select('*')
        .eq('tournament_id', tournament!.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Histórico de ações</p>

      {loadingLog ? (
        <PageSpinner />
      ) : !entries?.length ? (
        <EmptyState icon="📜" title="Nenhuma ação registrada" />
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div key={e.id} className="card px-4 py-2.5 text-sm flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {ACTION_LABELS[e.action] ?? e.action}
                </span>
                {e.payload && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    {(e.payload as any).round_number != null && `Rodada ${(e.payload as any).round_number}`}
                    {(e.payload as any).board != null && ` · Mesa ${(e.payload as any).board}`}
                    {(e.payload as any).before != null && ` · ${(e.payload as any).before} → ${(e.payload as any).after}`}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {new Date(e.created_at).toLocaleString('pt-BR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
