'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  useTournament,
  useTournamentRounds,
  useTournamentPlayers,
  useCreateRound,
  useUpdateRoundStatus,
  useRoundPairings,
  useUpdatePairingResult,
} from '@/lib/hooks/use-tournament';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ROUND_STATUS_COLORS, ROUND_STATUS_LABELS, formatScore } from '@/lib/utils/chess';
import type { GameResult, RoundPairingRow } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import { ImportStandings } from '@/components/admin/import-standings';
import { ImportPairings } from '@/components/admin/import-pairings';
import { NativeRounds } from '@/components/admin/native-rounds';

interface Props {
  params: Promise<{ slug: string }>;
}

export default function AdminRoundsPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);
  const { data: rounds, isLoading: loadingRounds } = useTournamentRounds(tournament?.id ?? '');
  const { data: tPlayers } = useTournamentPlayers(tournament?.id ?? '');
  const createRound = useCreateRound(tournament?.id ?? '');
  const updateRoundStatus = useUpdateRoundStatus(tournament?.id ?? '');

  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [showPairingForm, setShowPairingForm] = useState(false);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  // Torneio nativo: fluxo de pareamento próprio (F4) no lugar das importações.
  if ((tournament as any).mode === 'native') {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{tournament.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Rodadas e pareamento</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/admin/tournaments/${slug}/staff`}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Equipe
            </Link>
            <Link
              href={`/admin/tournaments/${slug}/history`}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Histórico
            </Link>
            <Link
              href={`/admin/tournaments/${slug}/players`}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Jogadores
            </Link>
            <Link
              href={`/tournaments/${slug}`}
              target="_blank"
              className="rounded-lg bg-brand-50 dark:bg-brand-950/50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400"
            >
              Ver público
            </Link>
          </div>
        </div>
        <NativeRounds tournament={tournament} />
      </div>
    );
  }

  const nextRoundNumber = (rounds?.length ?? 0) + 1;
  const canCreateRound = nextRoundNumber <= tournament.rounds_count;
  const selectedRound = rounds?.find((r) => r.id === selectedRoundId);

  async function handleCreateRound() {
    try {
      const r = await createRound.mutateAsync(nextRoundNumber);
      setSelectedRoundId(r.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

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

  async function handleRoundStatus(roundId: string, status: 'pending' | 'ongoing' | 'finished') {
    await updateRoundStatus.mutateAsync({ roundId, status });
    if (status === 'finished') {
      // recalculate standings
      const supabase = createClient();
      await supabase.rpc('recalculate_standings', { p_tournament_id: tournament!.id });
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{tournament.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gerenciar rodadas</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/tournaments/${slug}/players`}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Jogadores
          </Link>
          <Link
            href={`/tournaments/${slug}`}
            target="_blank"
            className="rounded-lg bg-brand-50 dark:bg-brand-950/50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400"
          >
            Ver público
          </Link>
        </div>
      </div>

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
          <button
            onClick={() => handleTournamentStatus('ongoing')}
            disabled={statusLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 shrink-0"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Iniciar torneio
          </button>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Round list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Rodadas ({rounds?.length ?? 0}/{tournament.rounds_count})
            </h2>
            {canCreateRound && (
              <Button size="sm" onClick={handleCreateRound} loading={createRound.isPending}>
                + Rodada {nextRoundNumber}
              </Button>
            )}
          </div>

          {loadingRounds ? (
            <PageSpinner />
          ) : !rounds?.length ? (
            <EmptyState icon="📋" title="Nenhuma rodada criada" description="Crie a primeira rodada para começar." />
          ) : (
            <div className="space-y-2">
              {rounds.map((round) => (
                <div
                  key={round.id}
                  onClick={() => setSelectedRoundId(round.id)}
                  className={`card p-3 cursor-pointer transition-all
                    ${selectedRoundId === round.id
                      ? 'border-brand-400 dark:border-brand-600 bg-brand-50 dark:bg-brand-950/30'
                      : 'hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${ROUND_STATUS_COLORS[round.status]}`}>
                        {round.round_number}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Rodada {round.round_number}
                      </span>
                    </div>
                    <Badge className={ROUND_STATUS_COLORS[round.status]}>
                      {ROUND_STATUS_LABELS[round.status]}
                    </Badge>
                  </div>

                  {selectedRoundId === round.id && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-brand-200 dark:border-brand-800">
                      {round.status === 'pending' && (
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); handleRoundStatus(round.id, 'ongoing'); }}>
                          Iniciar rodada
                        </Button>
                      )}
                      {round.status === 'ongoing' && (
                        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleRoundStatus(round.id, 'finished'); }}>
                          Finalizar rodada
                        </Button>
                      )}
                      {round.status !== 'pending' && (
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setShowPairingForm(true); }}>
                          Lançar resultados
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pairing form / results */}
        <div>
          {selectedRound && showPairingForm ? (
            <PairingResultsForm
              roundId={selectedRound.id}
              tournamentId={tournament.id}
              tournamentSlug={slug}
              onClose={() => setShowPairingForm(false)}
            />
          ) : selectedRound ? (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  Rodada {selectedRound.round_number}
                </h2>
                {selectedRound.status !== 'pending' && (
                  <Button size="sm" onClick={() => setShowPairingForm(true)}>
                    Lançar resultados
                  </Button>
                )}
              </div>

              {selectedRound.status === 'pending' && (
                <PairingCreator
                  roundId={selectedRound.id}
                  tournamentId={tournament.id}
                  tPlayers={tPlayers ?? []}
                />
              )}
            </div>
          ) : (
            <div className="card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Selecione uma rodada para gerenciar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pairing creator (manual) ──────────────────────────────────

function PairingCreator({ roundId, tournamentId, tPlayers }: {
  roundId: string; tournamentId: string; tPlayers: any[];
}) {
  const [whiteTpId, setWhiteTpId] = useState('');
  const [blackTpId, setBlackTpId] = useState('');
  const [board, setBoard] = useState('');
  const [isBye, setIsBye] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from('pairings').insert({
        tournament_id: tournamentId,
        round_id: roundId,
        board_number: board ? parseInt(board) : null,
        white_tp_id: whiteTpId || null,
        black_tp_id: isBye ? null : (blackTpId || null),
        result: isBye ? 'bye' : '*',
        white_points: isBye ? 1 : null,
        black_points: isBye ? null : null,
        is_bye: isBye,
      });
      if (err) throw err;
      setWhiteTpId('');
      setBlackTpId('');
      setBoard('');
      setIsBye(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleAdd} className="space-y-3">
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Criar emparcelamento</h2>
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
          Tabuleiro nº
        </label>
        <input
          type="number"
          value={board}
          onChange={(e) => setBoard(e.target.value)}
          className="w-20 h-8 rounded-lg border border-gray-300 dark:border-gray-700 px-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Brancas</label>
        <select
          required
          value={whiteTpId}
          onChange={(e) => setWhiteTpId(e.target.value)}
          className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 px-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        >
          <option value="">Selecionar jogador...</option>
          {tPlayers.map((tp) => (
            <option key={tp.id} value={tp.id}>
              {tp.player?.full_name} ({formatScore(tp.current_score)} pts)
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isBye} onChange={(e) => setIsBye(e.target.checked)} className="rounded" />
        BYE (jogador sem adversário)
      </label>

      {!isBye && (
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Pretas</label>
          <select
            required={!isBye}
            value={blackTpId}
            onChange={(e) => setBlackTpId(e.target.value)}
            className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 px-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="">Selecionar jogador...</option>
            {tPlayers.filter((tp) => tp.id !== whiteTpId).map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.player?.full_name} ({formatScore(tp.current_score)} pts)
              </option>
            ))}
          </select>
        </div>
      )}

      <Button type="submit" size="sm" loading={saving}>Adicionar</Button>
    </form>
  );
}

// ── Pairing results form ──────────────────────────────────────

function PairingResultsForm({ roundId, tournamentId, tournamentSlug, onClose }: {
  roundId: string; tournamentId: string; tournamentSlug: string; onClose: () => void;
}) {
  const { data: pairings, isLoading } = useRoundPairings(roundId);
  const updateResult = useUpdatePairingResult(tournamentId);

  const RESULTS: { value: GameResult; label: string }[] = [
    { value: '*',          label: '– em andamento' },
    { value: '1-0',        label: '1-0 (brancas vencem)' },
    { value: '0-1',        label: '0-1 (pretas vencem)' },
    { value: '1/2-1/2',   label: '½-½ (empate)' },
    { value: 'forfeit_white', label: 'WO brancas' },
    { value: 'forfeit_black', label: 'WO pretas' },
  ];

  if (isLoading) return <PageSpinner />;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Lançar resultados</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
      </div>

      {(!pairings?.length) ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nenhum emparelhamento criado.{' '}
          <button onClick={onClose} className="text-brand-600 dark:text-brand-400 hover:underline">
            Criar emparelhamentos primeiro.
          </button>
        </p>
      ) : (
        <div className="space-y-3">
          {pairings.map((pairing) => (
            <PairingResultRow
              key={pairing.pairing_id}
              pairing={pairing}
              results={RESULTS}
              onUpdate={(result) => updateResult.mutate({ pairingId: pairing.pairing_id, result })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PairingResultRow({ pairing, results, onUpdate }: {
  pairing: RoundPairingRow;
  results: { value: GameResult; label: string }[];
  onUpdate: (result: GameResult) => void;
}) {
  if (pairing.is_bye) {
    return (
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
        BYE – {pairing.white_name}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
        {pairing.board_number && <span>Tab. {pairing.board_number}</span>}
      </div>
      <div className="flex items-center gap-2 text-sm mb-2">
        <span className="font-medium text-gray-900 dark:text-gray-100 flex-1 truncate">
          ○ {pairing.white_name}
        </span>
        <span className="text-gray-400">vs</span>
        <span className="font-medium text-gray-900 dark:text-gray-100 flex-1 truncate text-right">
          ● {pairing.black_name}
        </span>
      </div>
      <select
        value={pairing.result}
        onChange={(e) => onUpdate(e.target.value as GameResult)}
        className="w-full h-8 rounded-lg border border-gray-300 dark:border-gray-700 px-2 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      >
        {results.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
    </div>
  );
}
