'use client';

import { use, useEffect, useState } from 'react';
import { useTournament } from '@/lib/hooks/use-tournament';
import { createClient } from '@/lib/supabase/client';
import { PageSpinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { TournamentImport } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

const supabase = createClient();

export default function AdminImportsPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);

  const [imports, setImports] = useState<TournamentImport[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Form state for creating a new entry
  const [newUrl, setNewUrl] = useState('');
  const [newGroup, setNewGroup] = useState('');

  useEffect(() => {
    if (!tournament?.id) return;
    void loadImports(tournament.id);
  }, [tournament?.id]);

  async function loadImports(tournamentId: string) {
    setLoadingList(true);
    const { data, error } = await supabase
      .from('tournament_imports')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true });
    if (error) setError(error.message);
    else setImports((data ?? []) as TournamentImport[]);
    setLoadingList(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!tournament?.id || !newUrl.trim()) return;
    setError('');
    setBusy('create');
    try {
      const { error } = await supabase.from('tournament_imports').insert({
        tournament_id: tournament.id,
        base_url: newUrl.trim(),
        pairing_group_name: newGroup.trim() || null,
        enabled: true,
      });
      if (error) throw error;
      setNewUrl('');
      setNewGroup('');
      await loadImports(tournament.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(row: TournamentImport) {
    setBusy(row.id);
    setError('');
    const { error } = await supabase
      .from('tournament_imports')
      .update({ enabled: !row.enabled })
      .eq('id', row.id);
    if (error) setError(error.message);
    if (tournament?.id) await loadImports(tournament.id);
    setBusy(null);
  }

  async function handleDelete(row: TournamentImport) {
    if (!confirm('Remover esta configuração de importação?')) return;
    setBusy(row.id);
    setError('');
    const { error } = await supabase.from('tournament_imports').delete().eq('id', row.id);
    if (error) setError(error.message);
    if (tournament?.id) await loadImports(tournament.id);
    setBusy(null);
  }

  async function handleEditUrl(row: TournamentImport) {
    const next = prompt('Nova URL do chess-results:', row.base_url);
    if (!next || next === row.base_url) return;
    setBusy(row.id);
    setError('');
    const { error } = await supabase
      .from('tournament_imports')
      .update({ base_url: next.trim() })
      .eq('id', row.id);
    if (error) setError(error.message);
    if (tournament?.id) await loadImports(tournament.id);
    setBusy(null);
  }

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  function statusBadge(row: TournamentImport) {
    if (!row.last_run_at) {
      return <span className="text-xs text-gray-400">Nunca executado</span>;
    }
    const when = new Date(row.last_run_at).toLocaleString('pt-BR');
    if (row.last_status === 'success') {
      return (
        <span className="text-xs text-green-600 dark:text-green-400">
          ✓ {when}
          {row.last_message ? ` · ${row.last_message}` : ''}
        </span>
      );
    }
    return (
      <span className="text-xs text-red-600 dark:text-red-400">
        ✗ {when}
        {row.last_message ? ` · ${row.last_message}` : ''}
      </span>
    );
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Importações automáticas (chess-results)
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="card p-4 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Adicionar importação
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Cole a URL da página de classificação no chess-results (.aspx). O cron diário fará o parse
          automático dos jogadores, emparceiramentos e classificação. Para torneios com múltiplos
          grupos, cadastre uma URL por grupo (uma com cada SNode).
        </p>
        <form onSubmit={handleCreate} className="space-y-2">
          <Input
            placeholder="https://s3.chess-results.com/tnr1369969.aspx?lan=10&art=1&rd=6&SNode=S0"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            disabled={busy === 'create'}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Grupo de emparceiramento (opcional, ex: Infantil)"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              disabled={busy === 'create'}
            />
            <Button type="submit" loading={busy === 'create'} disabled={!newUrl.trim()}>
              Adicionar
            </Button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            Configurações ({imports.length})
          </p>
        </div>
        {loadingList ? (
          <div className="py-8 flex justify-center"><PageSpinner /></div>
        ) : imports.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            Nenhuma importação configurada.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {imports.map((row) => (
              <div key={row.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {row.pairing_group_name ?? 'Único grupo'}
                    </p>
                    <p
                      className="text-xs text-gray-500 dark:text-gray-400 truncate"
                      title={row.base_url}
                    >
                      {row.base_url}
                    </p>
                    <div className="mt-1">{statusBadge(row)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggle(row)}
                      disabled={busy === row.id}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        row.enabled
                          ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {row.enabled ? 'Ativo' : 'Pausado'}
                    </button>
                    <button
                      onClick={() => handleEditUrl(row)}
                      disabled={busy === row.id}
                      className="rounded-full px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(row)}
                      disabled={busy === row.id}
                      className="rounded-full px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
