'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import {
  useGroups, useGroupRounds, useCreateDefaultGroup,
  useGenerateRound, useRoundTransition, useReturnRoundToDraft,
  useOverridePairing, usePairingHistory, useDraftWarnings,
  useRequestedByes, useToggleRequestedBye,
} from '@/lib/hooks/use-native-rounds';
import { useRoundPairings, useTournamentPlayers } from '@/lib/hooks/use-tournament';
import { useLivePgnIds } from '@/lib/hooks/use-player-history';
import { PgnAttachButton } from '@/components/tournament/pgn-attach';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { ROUND_STATUS_COLORS, ROUND_STATUS_LABELS, winnerSide } from '@/lib/utils/chess';
import { WhitePawn, BlackPawn } from '@/components/tournament/piece-icons';
import { PlayerScoreSummary } from '@/components/tournament/player-score-summary';
import { WhatsAppButton } from '@/components/ui/whatsapp-button';
import { SearchField } from '@/components/ui/search-field';
import { buildRoundMessage } from '@/lib/utils/whatsapp';
import { matchesPlayerSearch, normalizeSearchText } from '@/lib/utils/text';
import { canEditPairings, canReturnRoundToDraft, countEnteredResults } from '@/lib/utils/rounds';
import { requestedByeScoreForRound } from '@/lib/pairing/requested-bye';
import { resolveRoundSelection, roundPreparationHref, type RoundSelection } from '@/lib/utils/round-navigation';
import type { Tournament, Round } from '@/types/database';

/**
 * Rótulo do resultado. Esta lista é só de LEITURA — lançar e corrigir
 * resultado acontece no painel de resultados, não aqui: um <select> solto no
 * meio da lista de rodadas mudava a pontuação sem confirmação nenhuma, e
 * competia com o painel, que é a tela feita pra isso.
 */
const RESULT_LABELS: Record<string, string> = {
  '1-0': '1-0',
  '1/2-1/2': '½-½',
  '0-1': '0-1',
  forfeit_black: 'WO pretas',
  forfeit_white: 'WO brancas',
  double_forfeit: 'WO duplo',
  '*': 'sem resultado',
};

export function NativeRounds({ tournament }: { tournament: Tournament }) {
  const searchParams = useSearchParams();
  const { data: groups, isLoading } = useGroups(tournament.id);
  const createGroup = useCreateDefaultGroup(tournament.id);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;

  if (!groups?.length) {
    return (
      <EmptyState
        icon="♟"
        title="Crie o grupo de emparceiramento"
        description="Todo torneio nativo precisa de ao menos um grupo. Se o torneio não tem divisões, use um grupo único."
        action={
          <Button loading={createGroup.isPending} onClick={() => createGroup.mutate('Absoluto')}>
            Criar grupo &quot;Absoluto&quot;
          </Button>
        }
      />
    );
  }

  const groupId = selectedGroupId ?? groups.find((item) => item.id === searchParams.get('group'))?.id ?? groups[0].id;
  const group = groups.find((g) => g.id === groupId)!;

  return (
    <div>
      {tournament.status === 'finished' && (
        <div className="card p-4 mb-4 border-2 border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-center">
          <p className="font-semibold text-gray-900 dark:text-gray-100">🏆 Torneio encerrado!</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Todas as rodadas terminaram.{' '}
            <Link href={`/torneios/${tournament.slug}/classificacao`} className="underline font-medium">
              Ver classificação final →
            </Link>
          </p>
        </div>
      )}
      {groups.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                g.id === groupId
                  ? 'bg-brand-600 text-white'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <GroupPanel
        key={groupId}
        tournament={tournament}
        groupId={groupId}
        // Nome do grupo só faz sentido no texto quando há mais de um — num
        // torneio de grupo único ("Absoluto") citá-lo é ruído.
        groupName={groups.length > 1 ? group.name : null}
        groupRoundsCount={group.rounds_count ?? tournament.rounds_count}
        onError={setError}
      />
    </div>
  );
}

function GroupPanel({
  tournament, groupId, groupName, groupRoundsCount, onError,
}: {
  tournament: Tournament; groupId: string; groupName: string | null; groupRoundsCount: number;
  onError: (m: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: rounds, isLoading } = useGroupRounds(groupId);
  const { data: tPlayers } = useTournamentPlayers(tournament.id);
  const generate = useGenerateRound(tournament.slug, tournament.id, groupId);
  const transition = useRoundTransition(tournament.id, groupId);
  const preparationRef = useRef<HTMLDivElement>(null);
  const matchesRouteGroup = !searchParams.get('group') || searchParams.get('group') === groupId;
  const requestedRound = matchesRouteGroup ? searchParams.get('round') : null;
  const requestedPreparation = matchesRouteGroup ? searchParams.get('prepare') : null;
  const [selection, setSelection] = useState<RoundSelection>(
    () => rounds ? resolveRoundSelection(rounds, groupRoundsCount, requestedRound, requestedPreparation) : requestedRound
  );

  // After finishing, preparation is a distinct view: don't auto-open the old
  // round while its query is still refetching. A newly generated round can open.
  useEffect(() => {
    if (!rounds) return;
    if (selection === null) {
      setSelection(resolveRoundSelection(rounds, groupRoundsCount, requestedRound, requestedPreparation));
    } else if (typeof selection === 'number') {
      const generated = rounds.find((round) => round.round_number === selection);
      if (generated) setSelection(generated.id);
    }
  }, [rounds, selection, groupRoundsCount, requestedRound, requestedPreparation]);

  // A rodada 1 NÃO é gerada sozinha (nem ao iniciar o torneio, nem ao abrir esta aba): o
  // organizador marca as ausências (bye pedido) primeiro e gera pelo botão "Gerar rodada 1".
  // Rodada 1 pareada antes disso já nascia sem considerar quem não vai jogar.

  // Hooks precisam rodar antes de qualquer early return (regra dos hooks) —
  // nextRoundNumber é calculado com dados possivelmente ainda undefined.
  const lastRoundPre = rounds?.[rounds.length - 1];
  const lastRoundStatus = lastRoundPre?.status;
  const nextRoundNumberPre = (lastRoundPre?.round_number ?? 0) + 1;
  useEffect(() => {
    if (isLoading || typeof selection !== 'number' || selection !== nextRoundNumberPre
      || selection > groupRoundsCount || (lastRoundStatus && lastRoundStatus !== 'finished')) return;
    const target = preparationRef.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, [selection, isLoading, nextRoundNumberPre, groupRoundsCount, lastRoundStatus]);
  // Com a rodada mais recente ainda em rascunho (a 1ª nasce sozinha ao abrir esta aba), as
  // ausências marcadas valem para ELA: dá para marcar e regerar o pareamento antes de publicar.
  const byeRound = lastRoundPre?.status === 'draft' ? lastRoundPre.round_number : nextRoundNumberPre;
  const byes = useRequestedByes(tournament.id, byeRound);
  const toggleBye = useToggleRequestedBye(tournament.id, byeRound);

  if (isLoading) return <PageSpinner />;

  const isRoundRobin = tournament.tournament_type === 'round_robin';
  const groupPlayers = (tPlayers ?? []).filter((p: any) => p.pairing_group_id === groupId);
  const lastRound = rounds?.[rounds.length - 1];
  const selectedRound = rounds?.find((r) => r.id === selection);
  const finishedCount = (rounds ?? []).filter((r) => r.status === 'finished').length;
  const nextRoundNumber = (lastRound?.round_number ?? 0) + 1;
  const draftPending = lastRound?.status === 'draft';
  const eligibleForBye = groupPlayers.filter(
    (p: any) => p.status === 'active' && (p.joined_at_round ?? 1) <= byeRound
  );
  const canGenerate =
    finishedCount < groupRoundsCount &&
    (!lastRound || lastRound.status === 'finished');

  const run = async (fn: () => Promise<unknown>) => {
    onError('');
    try { await fn(); } catch (e: any) { onError(e.message ?? 'Erro'); }
  };

  // Grupo vazio e grupo sem seed são bloqueios diferentes com conselhos
  // diferentes. Mandar "gere o ranking inicial" para um grupo sem ninguém é um
  // beco sem saída: generate_initial_ranking não valida jogadores, roda com
  // sucesso, não muda nada, e o botão de parear continua desabilitado.
  const semParticipantes = (
    <>
      ⚠ Adicione participantes antes de parear a primeira rodada.{' '}
      <Link
        href={`/admin/torneios/${tournament.slug}/jogadores`}
        className="font-medium underline hover:no-underline"
      >
        Ir para Participantes
      </Link>
    </>
  );

  return (
    <div className="space-y-4">
      {/* O seed (ranking inicial) é gerado sozinho — ao iniciar o torneio, ou na hora de
          gerar a 1ª rodada se ninguém tiver clicado "Iniciar Torneio" antes; ver
          generateRoundDraft em lib/pairing/service.ts. Sem botão nem aviso aqui: a contagem
          de jogadores já está na aba Participantes. */}

      {/* Rodadas — navegação por chips, não acordeão: um clique troca qual
          rodada está visível, sempre uma só por vez (mesma linguagem visual
          dos chips de grupo acima, e mais parecido com a navegação da visão
          pública do que o antigo card que expandia/recolhia). */}
      {!!rounds?.length && (
        <div className="flex gap-2 flex-wrap">
          {rounds.map((round) => (
            <button
              key={round.id}
              type="button"
              onClick={() => setSelection(round.id)}
              aria-pressed={selection === round.id}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selection === round.id
                  ? 'bg-brand-600 text-white'
                  : `${ROUND_STATUS_COLORS[round.status]} hover:opacity-80`
              }`}
            >
              Rodada {round.round_number}
              {round.status === 'ongoing' && (
                <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${selection === round.id ? 'bg-white' : 'bg-amber-500'}`} />
              )}
            </button>
          ))}
          {canGenerate && (
            <button type="button" aria-pressed={selection === nextRoundNumber}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${selection === nextRoundNumber ? 'bg-brand-600 text-white' : 'border border-brand-300 text-brand-700 dark:text-brand-300'}`}
              onClick={() => setSelection(nextRoundNumber)}>
              Preparar rodada {nextRoundNumber}
            </button>
          )}
        </div>
      )}

      {selectedRound && (
        // key força RoundPanel a remontar do zero ao trocar de rodada — sem
        // isso, estado local (busca, modo de troca de pareamento) vazava de
        // uma rodada pra outra, porque o componente continuava o mesmo.
        <RoundPanel
          key={selectedRound.id}
          tournament={tournament}
          groupId={groupId}
          groupName={groupName}
          round={selectedRound}
          onAction={(action) =>
            run(async () => {
              await transition.mutateAsync({ action, roundId: selectedRound.id });
              // Publicar e reabrir levam direto ao painel de resultados: são
              // os dois casos em que o próximo passo é mexer em resultado.
              // Reabrir, em especial, só existe pra corrigir algo — e o
              // lugar de corrigir é o painel, não a lista.
              if (action === 'publish' || action === 'reopen') {
                router.push(`/admin/torneios/${tournament.slug}/rodadas/${selectedRound.id}/resultados`);
              } else if (action === 'finish' && selectedRound.round_number < groupRoundsCount) {
                setSelection(selectedRound.round_number + 1);
                router.replace(roundPreparationHref(tournament.slug, groupId, selectedRound.round_number + 1), { scroll: false });
              }
            })
          }
          canReopen={selectedRound.round_number === (lastRound?.round_number ?? 0)}
          busy={transition.isPending}
          onRegenerate={() => run(async () => {
            const res: any = await generate.mutateAsync(selectedRound.round_number);
            if (res?.roundId) setSelection(res.roundId);
          })}
          regenerating={generate.isPending}
        />
      )}

      {finishedCount < groupRoundsCount && (
        <div ref={preparationRef} tabIndex={-1} aria-label={`Preparar rodada ${nextRoundNumber}`} className="card scroll-mt-28 p-4 space-y-3 focus:outline-none">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Preparar rodada {nextRoundNumber}</h2>
          {canGenerate && <p className="text-sm text-gray-500 dark:text-gray-400">Confira as ausências antes de gerar o próximo emparceiramento.</p>}
          {!isRoundRobin && (
            <ByeSelector
              roundNumber={byeRound}
              byeScore={tournament.requested_bye_score}
              players={eligibleForBye}
              requestedIds={byes.data}
              disabled={toggleBye.isPending || (!canGenerate && !draftPending)}
              onToggle={(tpId, requested) => run(() => toggleBye.mutateAsync({ tpId, requested }))}
              // Rodada em rascunho já está pareada: a mudança só entra ao regerar.
              onRegenerate={draftPending ? () => run(async () => {
                const res: any = await generate.mutateAsync(lastRound!.round_number);
                if (res?.roundId) setSelection(res.roundId);
              }) : undefined}
              regenerating={generate.isPending}
            />
          )}

          {isRoundRobin && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Rodízio (todos contra todos): o pareamento de cada rodada é fixo (tabela de Berger), definido pelo ranking inicial. Com número ímpar de jogadores, um folga por rodada (sem ponto).
            </p>
          )}

          <Button
            loading={generate.isPending}
            disabled={!canGenerate}
            // Abre o card da rodada recém-criada: o efeito de auto-abrir acima
            // só cobre a primeira carga, então a
            // rodada nova nascia fechada e o pareamento ficava escondido.
            onClick={() => run(async () => {
              const res: any = await generate.mutateAsync(undefined);
              if (res?.roundId) setSelection(res.roundId);
            })}
          >
            ♟ Gerar rodada {nextRoundNumber} de {groupRoundsCount}
          </Button>
          {!canGenerate && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {groupPlayers.length === 0
                ? semParticipantes
                : lastRound && lastRound.status !== 'finished'
                  ? `⚠ Encerre a rodada ${lastRound.round_number} antes de gerar a próxima.`
                  : '⚠ Ainda não é possível gerar esta rodada.'}
            </p>
          )}
        </div>
      )}

      {finishedCount > 0 && (
        <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-100 dark:border-gray-800">
          <a
            href={`/api/admin/tournaments/${tournament.slug}/groups/${groupId}/export/trf`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-9 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            ⬇️ Exportar TRF (homologação)
          </a>
          <a
            href={`/torneios/${tournament.slug}/classificacao/imprimir`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-9 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            🖨️ Imprimir classificação
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * Marcação de ausências (bye pedido) da próxima rodada.
 *
 * Faltar é exceção, não regra: listar todo mundo aberto significava rolar
 * centenas de chips num torneio grande só pra chegar no botão de gerar. O
 * bloco nasce recolhido mostrando só quem JÁ está marcado (a exceção de
 * fato); a lista inteira, com busca por nome, fica a um clique.
 */
function ByeSelector({
  roundNumber, byeScore, players, requestedIds, disabled, onToggle, onRegenerate, regenerating,
}: {
  roundNumber: number;
  byeScore: number | null;
  players: any[];
  requestedIds: Set<string> | undefined;
  disabled: boolean;
  onToggle: (tpId: string, requested: boolean) => void;
  /** Só quando a rodada já está pareada em rascunho: aplica as ausências refazendo o pareamento. */
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const nameOf = (p: any) => p.player?.full_name ?? p.player_id;
  const marked = players.filter((p) => requestedIds?.has(p.id));
  const roundByeScore = requestedByeScoreForRound(byeScore, roundNumber);

  const q = normalizeSearchText(query.trim());
  const listed = q ? players.filter((p) => normalizeSearchText(String(nameOf(p))).includes(q)) : players;

  const chipClass = (requested: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
      requested
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Ausências na rodada {roundNumber}
            {marked.length > 0 && (
              <span className="ml-1.5 font-normal text-amber-600 dark:text-amber-400">
                · {marked.length} marcada{marked.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Quem não vai jogar recebe bye ({roundByeScore === 0.5 ? '½ ponto' : '0 pontos'}) e fica fora do pareamento.
            {byeScore === 0.5 && ' O ½ ponto vale apenas na 1ª rodada.'}
            {onRegenerate && ' O pareamento atual só muda ao regerar.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onRegenerate && (
            <Button size="sm" variant="secondary" loading={regenerating} onClick={onRegenerate}>
              Regerar pareamento
            </Button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {open ? 'Fechar' : 'Marcar ausência'}
          </button>
        </div>
      </div>

      {/* Recolhido: só quem está marcado, que é a informação que importa de relance. */}
      {!open && marked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {marked.map((p) => (
            <button
              key={p.id}
              disabled={disabled}
              onClick={() => onToggle(p.id, false)}
              title="Clique para desmarcar"
              className={chipClass(true)}
            >
              🚫 {nameOf(p)}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar participante…"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
          {listed.length === 0 ? (
            <p className="text-xs text-gray-400">Ninguém com esse nome neste grupo.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {listed.map((p) => {
                const requested = requestedIds?.has(p.id) ?? false;
                return (
                  <button
                    key={p.id}
                    disabled={disabled}
                    onClick={() => onToggle(p.id, !requested)}
                    className={chipClass(requested)}
                  >
                    {requested ? '🚫 ' : ''}{nameOf(p)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Painel da rodada selecionada — ações + mesas. Uma só instância por vez
 * (a que os chips acima escolheram), não mais um card por rodada que
 * expande/recolhe. Sem cabeçalho clicável: quem troca de rodada são os
 * chips, não isto aqui.
 */
function RoundPanel({
  tournament, groupId, groupName, round, onAction, canReopen, busy,
  onRegenerate, regenerating,
}: {
  tournament: Tournament; groupId: string; groupName: string | null; round: Round;
  onAction: (a: 'publish' | 'finish' | 'reopen') => void;
  canReopen: boolean; busy: boolean;
  onRegenerate: () => void; regenerating: boolean;
}) {
  const { data: pairings } = useRoundPairings(round.id);
  const returnToDraft = useReturnRoundToDraft(tournament.id, groupId);
  const [showReturnWarning, setShowReturnWarning] = useState(false);
  const [discardConfirmed, setDiscardConfirmed] = useState(false);
  const [returnError, setReturnError] = useState('');
  const resultCount = countEnteredResults(pairings ?? []);
  const hasResults = resultCount > 0;
  const canReturn = tournament.mode === 'native' && canReturnRoundToDraft(round, canReopen);

  async function confirmReturnToDraft() {
    if (!canReturn || returnToDraft.isPending || (hasResults && !discardConfirmed)) return;
    setReturnError('');
    try {
      await returnToDraft.mutateAsync({ roundId: round.id, discardResults: hasResults && discardConfirmed });
      setShowReturnWarning(false);
      setDiscardConfirmed(false);
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Não foi possível voltar para rascunho.';
      setReturnError(message.includes('RESULTS_CONFIRMATION_REQUIRED')
        ? 'Foram lançados resultados enquanto este aviso estava aberto. Confirme a exclusão abaixo para continuar.'
        : message);
    }
  }
  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          Rodada {round.round_number}
        </span>
        <Badge className={ROUND_STATUS_COLORS[round.status]}>
          {ROUND_STATUS_LABELS[round.status]}
        </Badge>
      </div>

      <div className={round.status === 'draft' ? 'grid gap-2 sm:flex sm:flex-wrap' : 'flex gap-2 flex-wrap'}>
        {round.status === 'draft' && (
          <>
            <Button size="sm" className="h-11 sm:h-8" loading={busy} onClick={() => onAction('publish')}>
              Publicar rodada
            </Button>
            <Button size="sm" className="h-11 sm:h-8" variant="secondary" loading={regenerating} onClick={onRegenerate}>
              Regerar pareamento
            </Button>
          </>
        )}
        {round.status === 'ongoing' && (
          <>
            {/* <Link> e não <a>: o <a> cru recarregava a página inteira,
                o que dava a sensação de passar por uma tela intermediária
                entre a lista e o painel. */}
            <Link
              href={`/admin/torneios/${tournament.slug}/rodadas/${round.id}/resultados`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 h-8 text-sm font-medium text-white hover:bg-brand-700"
            >
              📱 Painel de resultados
            </Link>
            <Button size="sm" loading={busy} onClick={() => onAction('finish')}>
              Encerrar rodada
            </Button>
          </>
        )}
        {round.status === 'finished' && canReopen && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => onAction('reopen')}>
            Reabrir rodada
          </Button>
        )}
        {canReturn && (
          <Button
            size="sm" variant="secondary" disabled={busy || !pairings}
            onClick={() => { setReturnError(''); setDiscardConfirmed(false); setShowReturnWarning(true); }}
          >
            Voltar para rascunho
          </Button>
        )}
        {round.status !== 'draft' && (
          <a
            href={`/torneios/${tournament.slug}/rodadas/${round.round_number}/imprimir`}
            target="_blank"
            className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-8 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            🖨️ Imprimir mesas
          </a>
        )}
        {/* Divulgar no zap só depois de publicar — rascunho não tem confronto
            definitivo pra mandar. Na mesma linha dos outros botões da rodada. */}
        {round.status !== 'draft' && (pairings?.length ?? 0) > 0 && (
          <WhatsAppButton
            compact
            label="Enviar mesas no WhatsApp"
            getText={() =>
              buildRoundMessage({
                tournamentName: tournament.name,
                roundNumber: round.round_number,
                groupName,
                statusLabel: ROUND_STATUS_LABELS[round.status],
                resultLabels: RESULT_LABELS,
                pairings: (pairings ?? []).map((p: any) => ({
                  board_number: p.board_number,
                  white_name: p.white_name,
                  black_name: p.black_name,
                  result: p.result,
                  is_bye: p.is_bye,
                  white_points: p.white_points,
                })),
                url: typeof window !== 'undefined'
                  ? `${window.location.origin}/torneios/${tournament.slug}/rodadas/${round.round_number}`
                  : undefined,
              })
            }
          />
        )}
      </div>
      <RoundBoards tournament={tournament} groupId={groupId} round={round} />
      {showReturnWarning && canReturn && (
        <Modal
          title={`Voltar a rodada ${round.round_number} para rascunho?`}
          onClose={() => { if (!returnToDraft.isPending) setShowReturnWarning(false); }}
        >
          <div className="space-y-4">
            <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Esta rodada já foi publicada. Os jogadores podem já ter visto o pareamento e se dirigido às mesas.
              Avise os participantes sobre a mudança antes de publicar novamente.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              A rodada deixará de aparecer para o público. As mesas e os inscritos serão mantidos,
              e você poderá revisar ou regerar o pareamento antes de publicar de novo.
            </p>
            {hasResults && (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                <p className="font-semibold">
                  {resultCount === 1 ? 'O resultado lançado será apagado.' : `Os ${resultCount} resultados lançados serão apagados.`}
                  {' '}Os pontos e a classificação serão recalculados sem esses resultados.
                </p>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox" checked={discardConfirmed} disabled={returnToDraft.isPending}
                    onChange={(event) => setDiscardConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
                  />
                  Confirmo a exclusão dos resultados desta rodada.
                </label>
              </div>
            )}
            {returnError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{returnError}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button autoFocus variant="secondary" disabled={returnToDraft.isPending} onClick={() => setShowReturnWarning(false)}>Cancelar</Button>
              <Button
                variant={hasResults ? 'danger' : 'primary'} loading={returnToDraft.isPending}
                disabled={hasResults && !discardConfirmed} onClick={confirmReturnToDraft}
              >
                {hasResults ? 'Apagar resultados e voltar' : 'Voltar para rascunho'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const WARNING_LABELS: Record<string, string> = {
  REMATCH: 'Confronto repetido',
  COLOR_STREAK: '3ª cor seguida',
  COLOR_IMBALANCE: 'Cores desequilibradas',
  SCORE_GAP: 'Diferença de pontos > 1',
  SECOND_PAIRING_BYE: '2º bye de pareamento',
  MANUAL_OVERRIDE: 'Mesa alterada à mão',
};

function RoundBoards({ tournament, groupId, round }: { tournament: Tournament; groupId: string; round: Round }) {
  const { data: pairings, isLoading } = useRoundPairings(round.id);
  const canAttachPgn = tournament.mode === 'native' && round.status !== 'draft';
  const { data: pgnIds } = useLivePgnIds(
    (pairings ?? []).filter((pairing) => !pairing.is_bye).map((pairing) => pairing.pairing_id),
    canAttachPgn,
  );
  const override = useOverridePairing(tournament.id, groupId, round.id);
  const isDraft = round.status === 'draft';
  const canOverride = canEditPairings(round);
  const { data: warnings } = useDraftWarnings(tournament.slug, round.id, isDraft);
  const { data: history } = usePairingHistory(round.id, true);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<{ pairingId: string; side: 'w' | 'b' } | null>(null);
  const [pendingMoves, setPendingMoves] = useState<
    Array<{ pairing_id: string; white_tp: string; black_tp: string | null }> | null
  >(null);
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  if (isLoading) return <PageSpinner />;
  if (!pairings?.length) return <p className="text-sm text-gray-500">Sem mesas.</p>;

  const filteredPairings = pairings.filter(
    (p: any) => matchesPlayerSearch(p.white_name, query) || matchesPlayerSearch(p.black_name ?? '', query)
  );

  function cancelEditing() {
    setEditing(false);
    setSelected(null);
    setPendingMoves(null);
    setJustification('');
    setError('');
  }

  function handleSeatClick(p: any, side: 'w' | 'b') {
    if (!selected) { setSelected({ pairingId: p.pairing_id, side }); return; }
    if (selected.pairingId === p.pairing_id && selected.side === side) { setSelected(null); return; }
    const p1 = pairings!.find((x: any) => x.pairing_id === selected.pairingId)!;
    const p2 = p;
    const get = (x: any, s: 'w' | 'b') => (s === 'w' ? x.white_tp_id : x.black_tp_id);
    const tp1 = get(p1, selected.side);
    const tp2 = get(p2, side);
    const setSeat = (x: any, s: 'w' | 'b', tp: string) =>
      s === 'w' ? { white: tp, black: x.black_tp_id } : { white: x.white_tp_id, black: tp };

    let moves: Array<{ pairing_id: string; white_tp: string; black_tp: string | null }>;
    if (p1.pairing_id === p2.pairing_id) {
      moves = [{ pairing_id: p1.pairing_id, white_tp: tp2, black_tp: tp1 }];
    } else {
      const n1 = setSeat(p1, selected.side, tp2);
      const n2 = setSeat(p2, side, tp1);
      moves = [
        { pairing_id: p1.pairing_id, white_tp: n1.white, black_tp: n1.black },
        { pairing_id: p2.pairing_id, white_tp: n2.white, black_tp: n2.black },
      ];
    }
    setSelected(null);
    setError('');
    setPendingMoves(moves);
  }

  async function confirmOverride() {
    if (!canOverride) { cancelEditing(); return; }
    if (!pendingMoves) return;
    if (justification.trim().length < 3) { setError('Informe a justificativa (mín. 3 caracteres).'); return; }
    setError('');
    try {
      await override.mutateAsync({ moves: pendingMoves, justification: justification.trim() });
      cancelEditing();
    } catch (e: any) { setError(e.message); }
  }

  const canSwap = editing && canOverride;

  const Seat = ({ p, side, name }: { p: any; side: 'w' | 'b'; name: string | null }) => {
    if (!canSwap || !name || p.is_bye) {
      const won = !p.is_bye && winnerSide(p.result, side === 'w' ? 'white' : 'black') === 'winner';
      return <span className={`min-w-0 break-words text-gray-900 dark:text-gray-100 ${won ? 'font-bold' : ''}`}>{name ?? 'BYE'}</span>;
    }
    const isSel = selected?.pairingId === p.pairing_id && selected?.side === side;
    return (
      <button
        onClick={() => handleSeatClick(p, side)}
        disabled={override.isPending}
        className={`min-w-0 break-words rounded px-1.5 py-0.5 text-left transition-colors ${
          isSel
            ? 'bg-brand-600 text-white'
            : 'text-gray-900 dark:text-gray-100 hover:bg-brand-100 dark:hover:bg-brand-900/40'
        }`}
        title="Clique em dois assentos para trocar os jogadores"
      >
        {name}
      </button>
    );
  };

  return (
    <div className="space-y-2">
      {isDraft && (warnings?.length ?? 0) > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Avisos do pareamento (regenere se necessário):
          <span className="block mt-1 space-x-2 space-y-1">
            {warnings!.map((w: any, i) => (
              <Badge key={i} className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                {w.board != null ? `Mesa ${w.board}: ` : ''}{WARNING_LABELS[w.code] ?? w.code}
              </Badge>
            ))}
          </span>
        </div>
      )}

      {canOverride && !editing && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Alterar pareamento
          </Button>
        </div>
      )}
      {canSwap && (
        <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 px-3 py-2 text-xs text-purple-700 dark:text-purple-300 flex items-center justify-between gap-2 flex-wrap">
          <span>Clique em dois jogadores para trocá-los. A alteração exige justificativa.</span>
          <button onClick={cancelEditing} className="font-medium underline">Cancelar</button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <SearchField value={query} onChange={setQuery} className="w-full sm:max-w-xs" />

      {filteredPairings.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Nenhuma mesa encontrada com esse nome.</p>
      ) : null}
      {filteredPairings.map((p: any) => {
        const whiteWon = !p.is_bye && winnerSide(p.result, 'white') === 'winner';
        const blackWon = !p.is_bye && winnerSide(p.result, 'black') === 'winner';
        // No celular cada jogador ocupa a própria linha (grid de 1 coluna) —
        // antes era um flex-wrap que quebrava no meio do confronto, deixando
        // os dois nomes emendados. De sm: pra cima volta a ser lado a lado.
        return (
        <div key={p.pairing_id} className="rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm">
          <div className="flex items-start gap-3">
            <span className="w-6 shrink-0 pt-0.5 text-gray-400 tabular-nums">
              <span className="sr-only">Mesa </span>{p.board_number ?? '—'}
            </span>

            <div className="min-w-0 flex-1 grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2">
              <div className="flex min-w-0 items-start gap-1.5">
                <WhitePawn className="h-8 w-6 shrink-0" />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Seat p={p} side="w" name={p.white_name} />
                    {whiteWon && <span aria-label="Vencedor" className="shrink-0 text-lg">🏆</span>}
                  </div>
                  <PlayerScoreSummary rating={p.white_rating} score={p.white_score} />
                </div>
              </div>
              <span className="hidden text-gray-400 sm:inline">×</span>
              <div className="flex min-w-0 items-start gap-1.5">
                <BlackPawn className="h-8 w-6 shrink-0" />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Seat p={p} side="b" name={p.black_name} />
                    {blackWon && <span aria-label="Vencedor" className="shrink-0 text-lg">🏆</span>}
                  </div>
                  {!p.is_bye && <PlayerScoreSummary rating={p.black_rating} score={p.black_score} />}
                </div>
              </div>
            </div>

            {/* O status pertence à rodada; só reservar espaço por mesa para bye ou resultado. */}
            {(p.is_bye || !isDraft) && (
              <div className="shrink-0 pt-0.5">
                {p.is_bye ? (
                  <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    Bye ({p.white_points ?? 0})
                  </Badge>
                ) : (
                  <span className={`text-xs font-medium tabular-nums ${
                    p.result === '*' ? 'text-gray-400' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {RESULT_LABELS[p.result] ?? p.result}
                  </span>
                )}
              </div>
            )}
          </div>

          {p.manual_override && (
            <div className="mt-1 pl-9">
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                alterada
              </Badge>
            </div>
          )}
          {canAttachPgn && !p.is_bye && (
            <PgnAttachButton
              slug={tournament.slug}
              pairingId={p.pairing_id}
              hasPgn={!!pgnIds?.has(p.pairing_id)}
              boardLabel={`Mesa ${p.board_number}`}
            />
          )}
        </div>
        );
      })}

      {(history?.length ?? 0) > 0 && (
        <div className="pt-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Histórico de alterações</p>
          <ul className="space-y-1">
            {history!.map((h) => (
              <li key={h.id} className="rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-800 dark:text-gray-200">{h.actor_name ?? 'Organizador'}</span>
                {' · '}{new Date(h.created_at).toLocaleString('pt-BR')}
                <p className="mt-0.5">Justificativa: {h.justification}</p>
                {h.moves.length > 0 && (
                  <p className="mt-0.5 text-gray-500">
                    {h.moves.map((m, i) => (
                      <span key={i}>{m.board != null ? `Mesa ${m.board}: ` : ''}{m.white_name} × {m.black_name}{i < h.moves.length - 1 ? ' · ' : ''}</span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingMoves && canOverride && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cancelEditing}>
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Justificar alteração</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Alterar o pareamento gerado exige justificativa (regra FIDE C.04). Fica registrado com seu nome.
            </p>
            <textarea
              autoFocus
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: correção de rating incorreto do jogador X"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setPendingMoves(null); setJustification(''); setError(''); }}>
                Voltar
              </Button>
              <Button size="sm" loading={override.isPending} onClick={confirmOverride}>
                Confirmar alteração
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
