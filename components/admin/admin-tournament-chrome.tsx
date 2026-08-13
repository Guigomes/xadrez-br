'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AdminTournamentTabs } from './admin-tournament-tabs';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { createClient } from '@/lib/supabase/client';
import { tournamentKeys } from '@/lib/hooks/use-tournament';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import { TOUR_STEPS } from '@/lib/tour/steps';
import { writeProgress, TOUR_ENABLED } from '@/lib/tour/state';
import type { TournamentMode, TournamentStatus } from '@/types/database';

interface Props {
  id: string;
  slug: string;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;
  registrationEndDate: string | null;
  /** Override do organizador (migration 045): false = "Reabrir Inscrições" com prazo vencido, o badge não deve mostrar "encerrada" só pela data. */
  registrationClosesByDate: boolean;
  /** false só quando status='draft' e pairing_mode='custom' sem grupo criado ou com classificação sem grupo — ver layout.tsx. */
  pairingReady: boolean;
}

/**
 * Transições manuais por status — exceção ao avanço automático por data
 * (registration -> registration_closed, e published/registration/
 * registration_closed -> ongoing, migration 040/043). 'finished' não tem
 * entrada: estado terminal, sem botão. 'cancelled' fica de fora — cancelar
 * mora na zona de perigo (edit/page.tsx), reativar mora no bloco isCancelled
 * abaixo. Movido de edit/page.tsx pra cá: viver aqui, fora das abas, evita
 * duplicar o mesmo badge+status em dois lugares da mesma tela.
 *
 * `extra`: campos além de `status` que a ação também grava. Usado só pelo
 * par Abrir/Reabrir Inscrições, pra ligar/desligar registration_closes_by_
 * date (migration 045) — sem isso, "Reabrir Inscrições" com o prazo já
 * vencido fechava de novo sozinho na consulta seguinte.
 */
const STATUS_ACTIONS: Partial<Record<TournamentStatus, { label: string; to: TournamentStatus; primary: boolean; extra?: Record<string, unknown> }[]>> = {
  draft: [
    { label: 'Publicar', to: 'published', primary: true },
  ],
  published: [
    { label: 'Voltar pra Rascunho', to: 'draft', primary: false },
    { label: 'Abrir Inscrições', to: 'registration', primary: true, extra: { registration_closes_by_date: true } },
  ],
  registration: [
    { label: 'Encerrar Inscrições', to: 'registration_closed', primary: true },
  ],
  registration_closed: [
    { label: 'Reabrir Inscrições', to: 'registration', primary: false, extra: { registration_closes_by_date: false } },
    { label: 'Iniciar Torneio', to: 'ongoing', primary: true },
  ],
  ongoing: [
    { label: 'Encerrar Torneio', to: 'finished', primary: true },
  ],
};

/**
 * Cabeçalho + abas do admin do torneio. Ausente no painel focado de
 * resultados do árbitro (rounds/[roundId]/results) — aquela tela é
 * mobile-first e não deve competir com a navegação por abas.
 */
export function AdminTournamentChrome({ id, slug, name, mode, status, registrationEndDate, registrationClosesByDate, pairingReady }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [statusSaving, setStatusSaving] = useState<TournamentStatus | null>(null);
  const [statusSaved, setStatusSaved] = useState(false);
  const [error, setError] = useState('');
  // router.refresh() dentro de startTransition mantém a árvore atual montada
  // enquanto o novo payload RSC carrega, em vez de desmontar/remontar de uma
  // vez (que era o "pulo" dos componentes na troca de situação).
  const [isPending, startTransition] = useTransition();

  if (/\/rounds\/[^/]+\/results/.test(pathname)) return null;

  async function handleStatusChange(newStatus: TournamentStatus, extra?: Record<string, unknown>) {
    setError('');
    setStatusSaved(false);
    setStatusSaving(newStatus);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase.from('tournaments').update({ status: newStatus, ...extra }).eq('id', id);
      if (updErr) throw updErr;

      // Ranking inicial não tem mais botão manual — gera sozinho aqui (clique
      // em "Iniciar Torneio") e também quando o torneio vira 'ongoing' sozinho
      // por data (migration 058, get_tournament_by_slug/search_tournaments).
      // Rede de segurança pra quem pula os dois: generateRoundDraft (lib/
      // pairing/service.ts) semeia na hora se "Gerar rodada 1" ainda achar o
      // grupo sem seed. Melhor esforço: falha aqui não desfaz a transição de
      // status, que já aconteceu.
      if (newStatus === 'ongoing' && mode === 'native') {
        const { data: groups } = await supabase
          .from('pairing_groups').select('id').eq('tournament_id', id);
        for (const g of groups ?? []) {
          await supabase.rpc('generate_initial_ranking', { p_group_id: g.id }).then(
            ({ error: seedErr }) => { if (seedErr) console.error('[seed automático]', seedErr.message); }
          );

          // Já deixa a rodada 1 pareada, em RASCUNHO — o organizador só
          // revisa e publica. Sem isso, iniciar o torneio deixava a tela de
          // Rodadas vazia esperando mais um clique que ele sempre daria.
          // Só quando o grupo ainda não tem rodada nenhuma: reiniciar um
          // torneio (ongoing -> ... -> ongoing) não pode reparear por cima.
          const { count: jaTemRodada } = await supabase
            .from('rounds').select('id', { count: 'exact', head: true }).eq('pairing_group_id', g.id);
          if ((jaTemRodada ?? 0) > 0) continue;

          const res = await fetch(
            `/api/admin/tournaments/${slug}/groups/${g.id}/rounds/generate`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
          );
          if (!res.ok) {
            // Grupo vazio é o caso comum aqui (NO_PLAYERS) e não é erro:
            // o organizador ainda vai cadastrar gente. Não atrapalha o
            // início do torneio nem vira mensagem na tela.
            const body = await res.json().catch(() => null);
            console.error('[rodada 1 automática]', body?.error ?? res.status);
          }
        }
        await qc.invalidateQueries({ queryKey: tournamentKeys.players(id) });
        await qc.invalidateQueries({ queryKey: ['group-rounds'] });
      }

      await qc.invalidateQueries({ queryKey: tournamentKeys.detail(slug) });
      // Badge/abas vêm de props de Server Component, lidas uma vez no
      // layout — invalidar o React Query não alcança isso (mesmo motivo de
      // antes, quando este controle morava em edit/page.tsx). O refresh vai
      // dentro da transition pra a troca não piscar/pular.
      startTransition(() => router.refresh());
      setStatusSaved(true);
      setTimeout(() => setStatusSaved(false), 2500);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao atualizar status.');
    } finally {
      setStatusSaving(null);
    }
  }

  function startTour() {
    writeProgress(TOUR_STEPS[0].id);
    router.push('/admin');
  }

  const isCancelled = status === 'cancelled';

  return (
    <div className="mb-6">
      {/* Nome sozinho na própria linha — dividindo a linha com os botões de
          ação (como antes) ele colapsava pra largura zero em telas estreitas:
          truncate liga overflow:hidden, que pelo spec de flexbox zera o
          min-width automático do item, e os botões (shrink-0) levavam todo o
          espaço. O nome do torneio sumia por completo no mobile. */}
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{name}</h1>
      <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 transition-opacity ${isPending ? 'opacity-60 cursor-progress' : ''}`}>
        {/* min-h reserva a altura da variante de 2 botões, pra a linha não
            mudar de altura quando a situação passa de 1 pra 2 ações e volta. */}
        <div className="flex min-h-[2.25rem] flex-wrap items-center gap-2">
          <Badge className={`${getTournamentStatusColor(status, registrationEndDate, registrationClosesByDate)} animate-fade-in`}>
            {status === 'ongoing' && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
            {getTournamentStatusLabel(status, registrationEndDate, registrationClosesByDate)}
          </Badge>
          {isCancelled ? (
            <button
              onClick={() => handleStatusChange('draft')}
              disabled={!!statusSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {statusSaving === 'draft' && <Spinner className="h-3 w-3" />} Reativar torneio
            </button>
          ) : (
            (STATUS_ACTIONS[status] ?? []).map((action) => {
              // "Publicar" travado com emparceiramento 'custom' incompleto —
              // ver comentário em layout.tsx sobre como pairingReady é calculado.
              const blocked = action.to === 'published' && !pairingReady;
              return (
                <button
                  key={action.to}
                  onClick={() => handleStatusChange(action.to, action.extra)}
                  disabled={!!statusSaving || blocked}
                  title={blocked ? 'Defina o emparceiramento na aba própria antes de publicar.' : undefined}
                  className={
                    action.primary
                      ? 'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50'
                      : 'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'
                  }
                >
                  {statusSaving === action.to && <Spinner className="h-3 w-3" />}
                  {action.label}
                </button>
              );
            })
          )}
        </div>
        {/* Botão de tour escondido enquanto TOUR_ENABLED = false. */}
        {TOUR_ENABLED && (
          <button
            type="button"
            onClick={startTour}
            title="Dicas de como criar um torneio"
            aria-label="Dicas de como criar um torneio"
            className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            ❔
          </button>
        )}
      </div>
      {status === 'draft' && !pairingReady && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 animate-fade-in">
          Emparceiramento personalizado incompleto — falta criar grupo ou mapear classificação na
          aba{' '}
          <a href={`/admin/tournaments/${slug}/groups`} className="underline">Emparceiramento</a>
          {' '}antes de publicar.
        </p>
      )}
      {/* Slot de altura fixa sempre presente: alternar só a opacidade evita o
          segundo pulo (o "✓ Salvo" entrando/saindo do fluxo empurrava as abas). */}
      <div className="mt-2 h-4" aria-live="polite">
        <span className={`text-xs font-medium text-green-600 dark:text-green-400 transition-opacity duration-200 ${statusSaved ? 'opacity-100' : 'opacity-0'}`}>
          ✓ Salvo
        </span>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="mt-4">
        <AdminTournamentTabs slug={slug} mode={mode} status={status} />
      </div>
    </div>
  );
}
