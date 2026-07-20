'use client';

import { useState } from 'react';
import {
  useGroups, useGroupRounds, useCreateDefaultGroup, useGenerateSeeds,
  useGenerateRound, useRoundTransition, useSetResult,
  useSwapDraft, useDraftWarnings,
} from '@/lib/hooks/use-native-rounds';
import { useRoundPairings, useTournamentPlayers } from '@/lib/hooks/use-tournament';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { ROUND_STATUS_COLORS, ROUND_STATUS_LABELS } from '@/lib/utils/chess';
import type { Tournament, Round, GameResult } from '@/types/database';

const RESULTS: { value: GameResult; label: string }[] = [
  { value: '1-0', label: '1-0' },
  { value: '1/2-1/2', label: '½-½' },
  { value: '0-1', label: '0-1' },
  { value: 'forfeit_black', label: 'WO pretas' },
  { value: 'forfeit_white', label: 'WO brancas' },
  { value: 'double_forfeit', label: 'WO duplo' },
  { value: '*', label: '(limpar)' },
];

export function NativeRounds({ tournament }: { tournament: Tournament }) {
  const { data: groups, isLoading } = useGroups(tournament.id);
  const createGroup = useCreateDefaultGroup(tournament.id);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;

  if (!groups?.length) {
    return (
      <EmptyState
        icon="♟"
        title="Crie o grupo de pareamento"
        description="Todo torneio nativo precisa de ao menos um grupo. Se o torneio não tem divisões, use um grupo único."
        action={
          <Button loading={createGroup.isPending} onClick={() => createGroup.mutate('Único')}>
            Criar grupo &quot;Único&quot;
          </Button>
        }
      />
    );
  }

  const groupId = selectedGroupId ?? groups[0].id;
  const group = groups.find((g) => g.id === groupId)!;

  return (
    <div>
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
        groupRoundsCount={group.rounds_count ?? tournament.rounds_count}
        onError={setError}
      />
    </div>
  );
}

function GroupPanel({
  tournament, groupId, groupRoundsCount, onError,
}: {
  tournament: Tournament; groupId: string; groupRoundsCount: number;
  onError: (m: string) => void;
}) {
  const { data: rounds, isLoading } = useGroupRounds(groupId);
  const { data: tPlayers } = useTournamentPlayers(tournament.id);
  const seeds = useGenerateSeeds(tournament.id, groupId);
  const generate = useGenerateRound(tournament.slug, tournament.id, groupId);
  const transition = useRoundTransition(tournament.id, groupId);
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);

  if (isLoading) return <PageSpinner />;

  const groupPlayers = (tPlayers ?? []).filter((p: any) => p.pairing_group_id === groupId);
  const seededCount = groupPlayers.filter((p: any) => p.initial_ranking != null).length;
  const lastRound = rounds?.[rounds.length - 1];
  const finishedCount = (rounds ?? []).filter((r) => r.status === 'finished').length;
  const canGenerate =
    seededCount > 0 &&
    finishedCount < groupRoundsCount &&
    (!lastRound || lastRound.status === 'finished');

  const run = async (fn: () => Promise<unknown>) => {
    onError('');
    try { await fn(); } catch (e: any) { onError(e.message ?? 'Erro'); }
  };

  return (
    <div className="space-y-4">
      {/* Seed */}
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            Jogadores: {groupPlayers.length} · Com seed: {seededCount}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            O ranking inicial ordena por rating e congela quando a rodada 1 é publicada.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={seeds.isPending}
          disabled={(rounds ?? []).some((r) => r.status !== 'draft')}
          onClick={() => run(() => seeds.mutateAsync())}
        >
          Gerar ranking inicial
        </Button>
      </div>

      {/* Rounds */}
      <div className="space-y-2">
        {(rounds ?? []).map((round) => (
          <RoundCard
            key={round.id}
            tournament={tournament}
            groupId={groupId}
            round={round}
            open={openRoundId === round.id}
            onToggle={() => setOpenRoundId(openRoundId === round.id ? null : round.id)}
            onAction={(action) => run(() => transition.mutateAsync({ action, roundId: round.id }))}
            canReopen={round.round_number === (lastRound?.round_number ?? 0)}
            busy={transition.isPending}
            onRegenerate={() => run(() => generate.mutateAsync(round.round_number))}
            regenerating={generate.isPending}
          />
        ))}
      </div>

      {canGenerate && (
        <Button
          loading={generate.isPending}
          onClick={() => run(() => generate.mutateAsync(undefined))}
        >
          ♟ Gerar rodada {(lastRound?.round_number ?? 0) + 1} de {groupRoundsCount}
        </Button>
      )}
      {seededCount === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Gere o ranking inicial antes de parear a primeira rodada.
        </p>
      )}
    </div>
  );
}

function RoundCard({
  tournament, groupId, round, open, onToggle, onAction, canReopen, busy,
  onRegenerate, regenerating,
}: {
  tournament: Tournament; groupId: string; round: Round;
  open: boolean; onToggle: () => void;
  onAction: (a: 'publish' | 'finish' | 'reopen') => void;
  canReopen: boolean; busy: boolean;
  onRegenerate: () => void; regenerating: boolean;
}) {
  return (
    <div className="card">
      <button onClick={onToggle} className="w-full p-4 flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            Rodada {round.round_number}
          </span>
          <Badge className={ROUND_STATUS_COLORS[round.status]}>
            {ROUND_STATUS_LABELS[round.status]}
          </Badge>
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {round.status === 'draft' && (
              <>
                <Button size="sm" loading={busy} onClick={() => onAction('publish')}>
                  Publicar rodada
                </Button>
                <Button size="sm" variant="secondary" loading={regenerating} onClick={onRegenerate}>
                  Regerar pareamento
                </Button>
              </>
            )}
            {round.status === 'ongoing' && (
              <>
                <a
                  href={`/admin/tournaments/${tournament.slug}/rounds/${round.id}/results`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 h-8 text-sm font-medium text-white hover:bg-brand-700"
                >
                  📱 Painel de resultados
                </a>
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
          </div>
          <RoundBoards tournament={tournament} groupId={groupId} round={round} />
        </div>
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
  const setResult = useSetResult(tournament.id, groupId);
  const swap = useSwapDraft(tournament.id, groupId, round.id);
  const isDraft = round.status === 'draft';
  const { data: warnings } = useDraftWarnings(tournament.slug, round.id, isDraft);
  const [selected, setSelected] = useState<{ pairingId: string; side: 'w' | 'b' } | null>(null);
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;
  if (!pairings?.length) return <p className="text-sm text-gray-500">Sem mesas.</p>;

  async function handleSeatClick(p: any, side: 'w' | 'b') {
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
    try { await swap.mutateAsync(moves); } catch (e: any) { setError(e.message); }
  }

  const Seat = ({ p, side, name }: { p: any; side: 'w' | 'b'; name: string | null }) => {
    if (!isDraft || !name) {
      return <span className="text-gray-900 dark:text-gray-100">{name ?? 'BYE'}</span>;
    }
    const isSel = selected?.pairingId === p.pairing_id && selected?.side === side;
    return (
      <button
        onClick={() => handleSeatClick(p, side)}
        disabled={swap.isPending}
        className={`rounded px-1.5 py-0.5 transition-colors ${
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
      {isDraft && (
        <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 px-3 py-2 text-xs text-purple-700 dark:text-purple-300">
          Modo edição: clique em dois jogadores para trocá-los de lugar.
          {(warnings?.length ?? 0) > 0 && (
            <span className="block mt-1 space-x-2">
              {warnings!.map((w: any, i) => (
                <Badge key={i} className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  {w.board != null ? `Mesa ${w.board}: ` : ''}{WARNING_LABELS[w.code] ?? w.code}
                </Badge>
              ))}
            </span>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {pairings.map((p: any) => (
        <div key={p.pairing_id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm flex-wrap">
          <div className="min-w-0 flex items-center flex-wrap gap-y-1">
            <span className="text-gray-400 mr-2">{p.board_number ?? '—'}</span>
            <Seat p={p} side="w" name={p.white_name} />
            <span className="text-gray-400 mx-1.5">×</span>
            <Seat p={p} side="b" name={p.black_name} />
          </div>
          {p.is_bye ? (
            <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              Bye ({p.white_points ?? 0})
            </Badge>
          ) : isDraft ? (
            <span className="text-xs text-gray-400">rascunho</span>
          ) : (
            <select
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
              value={p.result}
              disabled={setResult.isPending}
              onChange={async (e) => {
                setError('');
                try {
                  await setResult.mutateAsync({ pairingId: p.pairing_id, result: e.target.value });
                } catch (err: any) { setError(err.message); }
              }}
            >
              {RESULTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}
