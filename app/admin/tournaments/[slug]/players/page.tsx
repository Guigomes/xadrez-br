'use client';

import { use, useState } from 'react';
import { useTournament, useTournamentPlayers, useAddTournamentPlayer, useAssignPlayerGroup } from '@/lib/hooks/use-tournament';
import { usePlayerSearch, useCreatePlayer } from '@/lib/hooks/use-player';
import { useGroups, useCreateDefaultGroup } from '@/lib/hooks/use-native-rounds';
import { PageSpinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { formatScore } from '@/lib/utils/chess';
import type { Player, PlayerFormValues } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

export default function AdminPlayersPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);
  const { data: tPlayers, isLoading: loadingPlayers } = useTournamentPlayers(tournament?.id ?? '');
  const addPlayer = useAddTournamentPlayer(tournament?.id ?? '');
  const assignGroup = useAssignPlayerGroup(tournament?.id ?? '');
  const createPlayer = useCreatePlayer();
  const isNative = tournament?.mode === 'native';
  const { data: groups } = useGroups(isNative ? tournament!.id : '');
  const createGroup = useCreateDefaultGroup(tournament?.id ?? '');

  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const { data: searchResults } = usePlayerSearch(search);

  const [newPlayer, setNewPlayer] = useState<Partial<PlayerFormValues>>({});
  const [groupId, setGroupId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  // Torneio nativo com grupos exige grupo ao adicionar (o banco recusa sem isso).
  const needsGroup = isNative && (groups?.length ?? 0) > 0;
  const groupReady = !isNative || !!groupId;

  async function handleAddExisting(player: Player) {
    if (needsGroup && !groupId) { setError('Selecione o grupo antes de adicionar.'); return; }
    setError('');
    try {
      await addPlayer.mutateAsync({ player_id: player.id, pairing_group_id: groupId || undefined });
      setSearch('');
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateAndAdd(e: React.FormEvent) {
    e.preventDefault();
    if (needsGroup && !groupId) { setError('Selecione o grupo antes de adicionar.'); return; }
    setError('');
    try {
      const p = await createPlayer.mutateAsync(newPlayer as PlayerFormValues);
      await addPlayer.mutateAsync({ player_id: p.id, pairing_group_id: groupId || undefined });
      setNewPlayer({});
      setShowNewForm(false);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleAssignGroup(tpId: string, gId: string) {
    setError('');
    try {
      await assignGroup.mutateAsync({ tpId, groupId: gId });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleImportUrl() {
    if (!importUrl.trim() || !tournament) return;
    setError('');
    setImportReport('');
    setImporting(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/import-players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao importar.');
      setImportReport(
        `Importação concluída: ${data.added} adicionados, ${data.created} novos cadastros, ${data.reused} já existentes, ${data.skipped} ignorados, ${data.failed} falhas.`
      );
      setImportUrl('');
    } catch (err: any) {
      setError(err.message ?? 'Erro ao importar.');
    } finally {
      setImporting(false);
    }
  }

  const existingIds = new Set(tPlayers?.map((tp) => (tp as any).player?.id));

  return (
    <div className="max-w-2xl">
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {importReport && (
        <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          {importReport}
        </p>
      )}

      {/* Import by URL */}
      <div className="card p-4 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Importar participantes por link</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Cole o link de download do Chess-Results (padrão de ranking inicial). Os jogadores serão cadastrados e vinculados ao torneio.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="https://chess-results.com/..."
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            disabled={importing}
            onKeyDown={(e) => e.key === 'Enter' && handleImportUrl()}
          />
          <Button onClick={handleImportUrl} loading={importing} disabled={!importUrl.trim()}>
            Importar
          </Button>
        </div>
      </div>

      {/* Native tournament: pairing group is required before adding anyone */}
      {isNative && (
        <div className="card p-4 mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Grupo de pareamento</h2>
          {!groups?.length ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum grupo ainda.</p>
              <Button size="sm" variant="secondary" loading={createGroup.isPending}
                onClick={() => createGroup.mutate('Único')}>
                Criar grupo &quot;Único&quot;
              </Button>
            </div>
          ) : (
            <Select label="Adicionar novos participantes ao grupo *" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Selecione…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          )}
        </div>
      )}

      {/* Search existing players */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Adicionar jogador existente</h2>
          <Button size="sm" onClick={() => setShowNewForm((v) => !v)}>
            {showNewForm ? 'Fechar cadastro' : 'Cadastrar participante'}
          </Button>
        </div>
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(searchResults?.length ?? 0) > 0 && (
          <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {searchResults!.filter((p) => !existingIds.has(p.id)).map((player) => (
              <div key={player.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{player.full_name}</p>
                  <p className="text-xs text-gray-400">{player.state} {player.rating_std ? `· ${player.rating_std}` : ''}</p>
                </div>
                <Button size="sm" onClick={() => handleAddExisting(player)} loading={addPlayer.isPending}
                  disabled={needsGroup && !groupId}>
                  Adicionar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New player form */}
      {showNewForm && (
        <form onSubmit={handleCreateAndAdd} className="card p-4 mb-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Novo jogador</h2>
          <Input label="Nome completo *" required value={newPlayer.full_name ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, full_name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Estado" value={newPlayer.state ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, state: e.target.value }))} />
            <Input label="Rating Std" type="number" value={newPlayer.rating_std ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, rating_std: parseInt(e.target.value) || undefined }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="ID CBX" value={newPlayer.cbx_id ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, cbx_id: e.target.value }))} />
            <Input label="ID FIDE" value={newPlayer.fide_id ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, fide_id: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={createPlayer.isPending || addPlayer.isPending} disabled={needsGroup && !groupId}>
              Cadastrar e adicionar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowNewForm(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      {/* Player list */}
      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            Participantes ({tPlayers?.length ?? 0})
          </p>
        </div>
        {loadingPlayers ? (
          <div className="py-8 flex justify-center"><PageSpinner /></div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {tPlayers?.map((tp, i) => {
              const tpAny = tp as any;
              const missingGroup = isNative && !tpAny.pairing_group_id && (groups?.length ?? 0) > 0;
              return (
                <div key={tp.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs text-gray-400 w-5 text-center">{tp.initial_ranking ?? i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {tpAny.player?.full_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {tpAny.category?.name && `${tpAny.category.name} · `}
                      {tpAny.player?.city ?? tpAny.player?.state ?? ''}
                      {tpAny.player?.rating_std ? ` · ${tpAny.player.rating_std}` : ''}
                      {tpAny.player?.fide_id ? ` · FIDE ${tpAny.player.fide_id}` : ''}
                    </p>
                    {missingGroup && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-amber-600 dark:text-amber-400">⚠ sem grupo — não será pareado</span>
                        <select
                          className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-1.5 py-0.5 text-xs"
                          defaultValue=""
                          disabled={assignGroup.isPending}
                          onChange={(e) => e.target.value && handleAssignGroup(tp.id, e.target.value)}
                        >
                          <option value="" disabled>Atribuir grupo…</option>
                          {groups!.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-brand-600 dark:text-brand-400 tabular-nums">
                    {formatScore(tp.current_score)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
