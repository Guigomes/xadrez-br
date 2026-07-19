'use client';

import { useState } from 'react';
import {
  useGroups, useGroupRounds, useCreateDefaultGroup, useGenerateSeeds,
  useGenerateRound, useRoundTransition, useSetResult,
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
              <Button size="sm" loading={busy} onClick={() => onAction('finish')}>
                Encerrar rodada
              </Button>
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

function RoundBoards({ tournament, groupId, round }: { tournament: Tournament; groupId: string; round: Round }) {
  const { data: pairings, isLoading } = useRoundPairings(round.id);
  const setResult = useSetResult(tournament.id, groupId);
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;
  if (!pairings?.length) return <p className="text-sm text-gray-500">Sem mesas.</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {pairings.map((p: any) => (
        <div key={p.pairing_id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm flex-wrap">
          <div className="min-w-0">
            <span className="text-gray-400 mr-2">{p.board_number ?? '—'}</span>
            <span className="text-gray-900 dark:text-gray-100">{p.white_name}</span>
            <span className="text-gray-400 mx-1.5">×</span>
            <span className="text-gray-900 dark:text-gray-100">{p.black_name ?? 'BYE'}</span>
          </div>
          {p.is_bye ? (
            <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              Bye ({p.white_points ?? 0})
            </Badge>
          ) : round.status === 'draft' ? (
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
