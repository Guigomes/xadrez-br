'use client';

// Painel mobile do árbitro (F6): lançamento rápido de resultados por mesa.
import { use, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
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
import type { GameResult, Round } from '@/types/database';

const MAIN: { value: GameResult; label: string }[] = [
  { value: '1-0', label: '1 – 0' },
  { value: '1/2-1/2', label: '½ – ½' },
  { value: '0-1', label: '0 – 1' },
];
const WO: { value: GameResult; label: string }[] = [
  { value: 'forfeit_black', label: 'WO pretas' },
  { value: 'forfeit_white', label: 'WO brancas' },
  { value: 'double_forfeit', label: 'WO duplo' },
  { value: '*', label: 'Limpar' },
];

export default function ArbiterResultsPage({ params }: { params: Promise<{ slug: string; roundId: string }> }) {
  const { slug, roundId } = use(params);
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
  const setResult = useSetResult(tournament?.id ?? '', round?.pairing_group_id ?? '');
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
  const [showWoFor, setShowWoFor] = useState<string | null>(null);
  const boardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const games = useMemo(
    () => (pairings ?? []).filter((p: any) => !p.is_bye),
    [pairings],
  );
  const done = games.filter((p: any) => p.result !== '*').length;
  const allDone = games.length > 0 && done === games.length;

  if (isLoading || loadingPairings) return <PageSpinner />;
  if (!tournament || !round) return <p>Rodada não encontrada.</p>;

  async function submit(p: any, result: GameResult) {
    setError('');
    setShowWoFor(null);
    try {
      await setResult.mutateAsync({ pairingId: p.pairing_id, result });
      // avança para a próxima mesa pendente
      const next = games.find((g: any) => g.result === '*' && g.pairing_id !== p.pairing_id);
      if (next) {
        boardRefs.current[next.pairing_id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e: any) {
      setError(e.message ?? 'Erro ao lançar resultado');
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
        {games.map((p: any) => {
          const pending = p.result === '*';
          const assignedTo = p.board_number != null ? arbiterByBoard.get(p.board_number) : undefined;
          const isMine = assignedTo === user?.id;
          const locked = !!assignedTo && !isMine && myRole !== 'organizer';
          return (
            <div
              key={p.pairing_id}
              ref={(el) => { boardRefs.current[p.pairing_id] = el; }}
              className={`card p-4 ${pending ? '' : 'opacity-70'}`}
            >
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-400">MESA {p.board_number}</span>
                <span className="flex items-center gap-1.5">
                  {assignedTo ? (
                    <>
                      <Badge className={isMine
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}>
                        ⚖️ {isMine ? 'Sua mesa' : staffName(assignedTo)}
                      </Badge>
                      {(isMine || myRole === 'organizer') && p.board_number != null && (
                        <button
                          onClick={() => unassignBoard.mutate(p.board_number)}
                          disabled={unassignBoard.isPending}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          liberar
                        </button>
                      )}
                    </>
                  ) : p.board_number != null && myRole ? (
                    <button
                      onClick={() => assignBoard.mutate({ boardNumber: p.board_number, userId: user!.id })}
                      disabled={assignBoard.isPending || !user}
                      className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Assumir mesa
                    </button>
                  ) : null}
                  {myRole === 'organizer' && p.board_number != null && (staff?.length ?? 0) > 0 && (
                    <select
                      className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-1.5 py-0.5 text-xs"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) assignBoard.mutate({ boardNumber: p.board_number, userId: e.target.value });
                      }}
                    >
                      <option value="">atribuir…</option>
                      {staff!.map((s) => (
                        <option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>
                      ))}
                    </select>
                  )}
                </span>
                {!pending && !locked && (
                  <button
                    onClick={() => setShowWoFor(showWoFor === p.pairing_id ? null : p.pairing_id)}
                    className="text-xs text-brand-600 dark:text-brand-400"
                  >
                    corrigir
                  </button>
                )}
              </div>
              {locked && pending && (
                <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                  Mesa atendida por {staffName(assignedTo!)} — só ele(a) ou um organizador lança o resultado.
                </p>
              )}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100 text-right truncate">{p.white_name}</span>
                <span className="text-gray-400 text-xs">×</span>
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.black_name}</span>
              </div>

              {(pending || showWoFor === p.pairing_id) && round.status !== 'draft' && !locked ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {MAIN.map((r) => (
                      <button
                        key={r.value}
                        disabled={setResult.isPending}
                        onClick={() => submit(p, r.value)}
                        className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 font-bold text-gray-900 dark:text-gray-100 text-lg active:bg-brand-600 active:text-white hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {WO.map((r) => (
                      <button
                        key={r.value}
                        disabled={setResult.isPending}
                        onClick={() => submit(p, r.value)}
                        className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        {r.label}
                      </button>
                    ))}
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
            </div>
          );
        })}
      </div>

      {/* rodapé fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 p-3">
        <div className="max-w-lg mx-auto flex gap-2">
          <Link
            href={`/admin/tournaments/${slug}/rounds`}
            className="flex-1 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 px-4 h-11 text-sm font-medium text-gray-600 dark:text-gray-400"
          >
            ← Rodadas
          </Link>
          {round.status === 'ongoing' && (
            <Button
              className="flex-1 h-11"
              disabled={!allDone}
              loading={transition.isPending}
              onClick={async () => {
                setError('');
                try { await transition.mutateAsync({ action: 'finish', roundId }); }
                catch (e: any) { setError(e.message); }
              }}
            >
              {allDone ? 'Encerrar rodada' : `Faltam ${games.length - done}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
