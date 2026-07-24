'use client';

import { use, useState } from 'react';
import { useTournament } from '@/lib/hooks/use-tournament';
import {
  useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup,
} from '@/lib/hooks/use-native-rounds';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { PairingGroup } from '@/types/database';

export default function GroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p className="text-sm text-gray-500">Torneio não encontrado.</p>;

  if (tournament.mode !== 'native') {
    return (
      <EmptyState
        icon="🔄"
        title="Torneio importado"
        description="Grupos de torneios importados são definidos na origem (chess-results) e não são editados aqui."
      />
    );
  }

  return <GroupsManager tournamentId={tournament.id} defaultRounds={tournament.rounds_count} />;
}

function GroupsManager({ tournamentId, defaultRounds }: { tournamentId: string; defaultRounds: number }) {
  const { data: groups, isLoading } = useGroups(tournamentId);
  const createGroup = useCreateGroup(tournamentId);
  const [newName, setNewName] = useState('');
  const [newRounds, setNewRounds] = useState('');
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;

  async function handleAdd() {
    if (newName.trim().length < 1) { setError('Informe o nome do grupo.'); return; }
    setError('');
    try {
      await createGroup.mutateAsync({
        name: newName,
        rounds_count: newRounds ? Number(newRounds) : null,
        sort_order: groups?.length ?? 0,
      });
      setNewName('');
      setNewRounds('');
    } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Grupos de emparceiramento</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Cada grupo pareia de forma independente (ex: Absoluto, Sub-14, Feminino). Sem grupos definidos,
          use um único grupo. O nº de rodadas do grupo é opcional — vazio herda {defaultRounds} do torneio.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!groups?.length ? (
        <EmptyState
          icon="♟"
          title="Nenhum grupo ainda"
          description="Crie o primeiro grupo abaixo. Para um evento sem divisões, um grupo único basta."
        />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <GroupRow key={g.id} group={g} tournamentId={tournamentId} defaultRounds={defaultRounds} onError={setError} />
          ))}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Adicionar grupo</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Input label="Nome" placeholder="Ex: Absoluto" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input
            label="Rodadas"
            type="number"
            min={1}
            max={20}
            placeholder={String(defaultRounds)}
            value={newRounds}
            onChange={(e) => setNewRounds(e.target.value)}
            className="sm:w-24"
          />
          <Button loading={createGroup.isPending} onClick={handleAdd}>Adicionar</Button>
        </div>
      </div>
    </div>
  );
}

function GroupRow({
  group, tournamentId, defaultRounds, onError,
}: {
  group: PairingGroup; tournamentId: string; defaultRounds: number; onError: (m: string) => void;
}) {
  const updateGroup = useUpdateGroup(tournamentId);
  const deleteGroup = useDeleteGroup(tournamentId);
  const [name, setName] = useState(group.name);
  const [rounds, setRounds] = useState(group.rounds_count != null ? String(group.rounds_count) : '');
  const [confirmDel, setConfirmDel] = useState(false);

  const dirty = name.trim() !== group.name || (rounds ? Number(rounds) : null) !== group.rounds_count;

  async function save() {
    if (name.trim().length < 1) { onError('Nome do grupo não pode ficar vazio.'); return; }
    onError('');
    try {
      await updateGroup.mutateAsync({
        id: group.id,
        name,
        rounds_count: rounds ? Number(rounds) : null,
      });
    } catch (e: any) { onError(e.message); }
  }

  async function remove() {
    onError('');
    try { await deleteGroup.mutateAsync(group.id); } catch (e: any) { onError(e.message); setConfirmDel(false); }
  }

  return (
    <div className="card p-4 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[10rem]">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Nome</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="w-24">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Rodadas</label>
        <Input type="number" min={1} max={20} placeholder={String(defaultRounds)} value={rounds} onChange={(e) => setRounds(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={!dirty} loading={updateGroup.isPending} onClick={save}>
          Salvar
        </Button>
        {confirmDel ? (
          <>
            <Button size="sm" variant="secondary" loading={deleteGroup.isPending} onClick={remove}>
              Confirmar
            </Button>
            <button onClick={() => setConfirmDel(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  );
}
