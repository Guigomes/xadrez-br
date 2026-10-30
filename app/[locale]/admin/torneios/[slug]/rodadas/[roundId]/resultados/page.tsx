'use client';

// Painel mobile do árbitro (F6): lançamento rápido de resultados por mesa.
import { use, useMemo, useRef, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { useMutationState, useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useTournament, useRoundPairings } from '@/lib/hooks/use-tournament';
import { useSetResult, useRoundTransition } from '@/lib/hooks/use-native-rounds';
import {
  useMyTournamentRole, useStaff, useBoardArbiters, useAssignBoard, useUnassignBoard,
} from '@/lib/hooks/use-staff';
import { useUser } from '@/lib/hooks/use-auth';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { winnerSide } from '@/lib/utils/chess';
import { WhitePawn, BlackPawn } from '@/components/tournament/piece-icons';
import { previewRoundResults, resultMutationKey, type EnteredResult, type ResultSubmission } from '@/lib/utils/round-results';
import type { Round, RoundPairingRow } from '@/types/database';

const MAIN: { value: EnteredResult; label: string }[] = [
  { value: '1-0', label: '1 – 0' },
  { value: '1/2-1/2', label: '½ – ½' },
  { value: '0-1', label: '0 – 1' },
];
const WO: { value: EnteredResult; label: string }[] = [
  { value: 'forfeit_black', label: 'WO pretas' },
  { value: 'forfeit_white', label: 'WO brancas' },
  { value: 'double_forfeit', label: 'WO duplo' },
  { value: '*', label: 'Limpar' },
];

export default function ArbiterResultsPage({ params }: { params: Promise<{ slug: string; roundId: string }> }) {
  const { slug, roundId } = use(params);
  const router = useRouter();
  const { data: tournament, isLoading } = useTournament(slug);

  const { data: round } = useQuery({
    queryKey: ['round', roundId],
    queryFn: async (): Promise<Round | null> => {
      const supabase = createClient();
      const { data } = await supabase.from('rounds').select('*').eq('id', roundId).single();
      return data;
    },
  });

  const { data: pairings, isLoading: loadingPairings } = useRoundPairings(roundId);
  const setResult = useSetResult(tournament?.id ?? '', round?.pairing_group_id ?? '', roundId);
  const pendingResults = useMutationState({
    filters: { mutationKey: resultMutationKey(roundId), exact: true, status: 'pending' },
    select: (mutation) => mutation.state.variables as ResultSubmission,
  });
  const transition = useRoundTransition(tournament?.id ?? '', round?.pairing_group_id ?? '');
  const { user } = useUser();
  const { data: myRole } = useMyTournamentRole(tournament?.id ?? '');
  const { data: staff } = useStaff(tournament?.id ?? '');
  const groupId = round?.pairing_group_id ?? '';
  const { data: boardArbiters } = useBoardArbiters(groupId);
  const assignBoard = useAssignBoard(groupId);
  const unassignBoard = useUnassignBoard(groupId);

  const arbiterByBoard = useMemo(
    () => new Map((boardArbiters ?? []).map((b) => [b.board_number, b.user_id])),
    [boardArbiters],
  );
  const staffName = (userId: string) =>
    staff?.find((s) => s.user_id === userId)?.full_name
    ?? staff?.find((s) => s.user_id === userId)?.email
    ?? (userId === tournament?.created_by ? 'Organizador' : 'Árbitro');
  const [error, setError] = useState('');
  const [boardErrors, setBoardErrors] = useState<Record<string, string>>({});
  const submitting = useRef(new Set<string>());
  const boardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const games = useMemo(
    () => previewRoundResults(pairings ?? [], pendingResults).filter((p) => !p.is_bye),
    [pairings, pendingResults],
  );
  const savingIds = new Set(pendingResults.map((entry) => entry.pairingId));
  const done = games.filter((p) => p.result !== '*').length;
  const allDone = games.length > 0 && done === games.length;

  if (isLoading || loadingPairings) return <PageSpinner />;
  if (!tournament || !round) return <p>Rodada não encontrada.</p>;

  async function submit(p: RoundPairingRow, result: EnteredResult) {
    if (submitting.current.has(p.pairing_id) || p.result === result) return;
    submitting.current.add(p.pairing_id);
    const wasPending = p.result === '*';
    setError('');
    setBoardErrors((previous) => ({ ...previous, [p.pairing_id]: '' }));
    try {
      await setResult.mutateAsync({ pairingId: p.pairing_id, result });
      // avança para a próxima mesa pendente — só no primeiro lançamento; uma
      // correção (mesa já tinha resultado) não deveria pular a tela pro
      // árbitro, que ainda está olhando pra essa mesa.
      if (wasPending) {
        const next = games.find((g) => g.result === '*' && g.pairing_id !== p.pairing_id && !submitting.current.has(g.pairing_id));
        if (next) {
          boardRefs.current[next.pairing_id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Erro ao lançar resultado';
      setBoardErrors((previous) => ({ ...previous, [p.pairing_id]: `Não foi possível salvar. O resultado anterior foi restaurado. ${message}` }));
      boardRefs.current[p.pairing_id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      submitting.current.delete(p.pairing_id);
    }
  }

  return (
    <div className="max-w-lg mx-auto pb-24">
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 py-3 mb-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-bold text-gray-900 dark:text-gray-100 truncate">
              Rodada {round.round_number}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{tournament.name}</p>
          </div>
          <Badge className={allDone
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}>
            {done}/{games.length}
          </Badge>
        </div>
        {/* progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-brand-600 transition-all"
            style={{ width: games.length ? `${(done / games.length) * 100}%` : 0 }}
          />
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {round.status === 'draft' && (
        <p className="mb-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 px-4 py-3 text-sm text-purple-700 dark:text-purple-300">
          Esta rodada ainda é um rascunho — publique antes de lançar resultados.
        </p>
      )}

      <div className="space-y-3">
        {games.map((p) => {
          const pending = p.result === '*';
          const saving = savingIds.has(p.pairing_id);
          const boardNumber = p.board_number;
          const assignedTo = boardNumber != null ? arbiterByBoard.get(boardNumber) : undefined;
          const isMine = assignedTo === user?.id;
          const locked = !!assignedTo && !isMine && myRole !== 'organizer';
          const canEnter = round.status !== 'draft' && round.status !== 'finished' && !locked;
          return (
            <div
              key={p.pairing_id}
              ref={(el) => { boardRefs.current[p.pairing_id] = el; }}
              className={`card p-4 ${!pending ? 'border-l-4 border-green-500 dark:border-green-600' : ''}`}
            >
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-400">MESA {boardNumber}</span>
                {saving && <span role="status" className="text-xs text-gray-500 dark:text-gray-400">Salvando…</span>}
                <span className="flex items-center gap-1.5">
                  {assignedTo ? (
                    <>
                      <Badge className={isMine
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}>
                        ⚖️ {isMine ? 'Sua mesa' : staffName(assignedTo)}
                      </Badge>
                      {(isMine || myRole === 'organizer') && boardNumber != null && (
                        <button
                          onClick={() => unassignBoard.mutate(boardNumber)}
                          disabled={unassignBoard.isPending}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          liberar
                        </button>
                      )}
                    </>
                  ) : boardNumber != null && myRole ? (
                    <button
                      onClick={() => assignBoard.mutate({ boardNumber, userId: user!.id })}
                      disabled={assignBoard.isPending || !user}
                      className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Assumir mesa
                    </button>
                  ) : null}
                  {myRole === 'organizer' && boardNumber != null && (staff?.length ?? 0) > 0 && (
                    <select
                      className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-1.5 py-0.5 text-xs"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) assignBoard.mutate({ boardNumber, userId: e.target.value });
                      }}
                    >
                      <option value="">atribuir…</option>
                      {staff!.map((s) => (
                        <option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>
                      ))}
                    </select>
                  )}
                </span>
              </div>
              {locked && pending && (
                <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                  Mesa atendida por {staffName(assignedTo!)} — só ele(a) ou um organizador lança o resultado.
                </p>
              )}
              <div className="grid gap-2 mb-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start">
                <span className="flex min-w-0 items-start gap-1.5 font-medium text-gray-900 dark:text-gray-100">
                  <WhitePawn className="mt-0.5 h-4 w-3 shrink-0" />
                  <span className="min-w-0 break-words">{p.white_name}</span>
                  {winnerSide(p.result, 'white') === 'winner' && <span className="shrink-0 text-xs">🏆</span>}
                </span>
                <span aria-hidden="true" className="hidden text-gray-400 text-xs sm:block">×</span>
                <span className="flex min-w-0 items-start gap-1.5 font-medium text-gray-900 dark:text-gray-100">
                  <BlackPawn className="mt-0.5 h-4 w-3 shrink-0" />
                  <span className="min-w-0 break-words">{p.black_name}</span>
                  {winnerSide(p.result, 'black') === 'winner' && <span className="shrink-0 text-xs">🏆</span>}
                </span>
              </div>

              {/* Botões continuam visíveis e clicáveis mesmo com resultado
                  já lançado — o resultado selecionado só fica destacado em
                  verde. A partida pode ser corrigida a qualquer momento até
                  a rodada encerrar (sem precisar de um link "corrigir" à
                  parte pra reabrir os botões). */}
              {canEnter ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {MAIN.map((r) => {
                      const active = p.result === r.value;
                      return (
                        <button
                          key={r.value}
                          disabled={saving || transition.isPending}
                          aria-pressed={active}
                          onClick={() => submit(p, r.value)}
                          className={`h-12 rounded-xl font-bold text-lg transition-colors ${
                            active
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-brand-100 dark:hover:bg-brand-900/40'
                          }`}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {WO.map((r) => {
                      const active = r.value !== '*' && p.result === r.value;
                      return (
                        <button
                          key={r.value}
                          disabled={saving || transition.isPending}
                          aria-pressed={active}
                          onClick={() => submit(p, r.value)}
                          className={`h-9 rounded-lg border text-xs transition-colors ${
                            active
                              ? 'bg-green-600 border-green-600 text-white'
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : !pending ? (
                <p className="text-center text-xl font-bold text-gray-900 dark:text-gray-100">
                  {p.result === 'forfeit_white' ? 'WO (0–1)'
                    : p.result === 'forfeit_black' ? 'WO (1–0)'
                    : p.result === 'double_forfeit' ? 'WO duplo'
                    : p.result === '1/2-1/2' ? '½ – ½' : p.result}
                </p>
              ) : null}
              {boardErrors[p.pairing_id] && (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
                  {boardErrors[p.pairing_id]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* rodapé fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 p-3">
        <div className="max-w-lg mx-auto flex gap-2">
          <Link
            href={`/admin/torneios/${slug}/rodadas?round=${roundId}`}
            className="flex-1 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 px-4 h-11 text-sm font-medium text-gray-600 dark:text-gray-400"
          >
            ← Rodadas
          </Link>
          {round.status === 'ongoing' && (
            <Button
              className="flex-1 h-11"
              disabled={!allDone || pendingResults.length > 0}
              loading={transition.isPending}
              onClick={async () => {
                if (submitting.current.size > 0) return;
                setError('');
                try {
                  await transition.mutateAsync({ action: 'finish', roundId });
                  // Antes daqui não acontecia nada: o botão sumia (o guard de
                  // status deixava de bater) e o árbitro ficava na mesma tela
                  // sem saber se deu certo. Agora sai da tela — e para onde
                  // depende de o torneio ter acabado ou não. Quem decide isso é
                  // o banco: finish_round (migration 036) já vira o torneio pra
                  // 'finished' quando todo grupo cumpriu suas rodadas, então
                  // basta reler o status.
                  const supabase = createClient();
                  const { data: t } = await supabase
                    .from('tournaments').select('status').eq('slug', slug).maybeSingle();
                  router.push(
                    t?.status === 'finished'
                      ? `/admin/torneios/${slug}/classificacao`
                      : `/admin/torneios/${slug}/rodadas?round=${roundId}`
                  );
                } catch (e: any) { setError(e.message); }
              }}
            >
              {pendingResults.length > 0 ? 'Salvando…' : allDone ? 'Encerrar rodada' : `Faltam ${games.length - done}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
