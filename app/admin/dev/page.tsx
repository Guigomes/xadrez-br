'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/use-auth';
import { useAllTournaments, useTestPlayersCount, useGenerateTestPlayers, useCleanupTestPlayers } from '@/lib/hooks/use-dev-panel';
import { useGroups, useCreateDefaultGroup } from '@/lib/hooks/use-native-rounds';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';

export default function DevPanelPage() {
  const { data: profile, isLoading: loadingProfile } = useProfile();

  if (loadingProfile) return <PageSpinner />;
  if (profile?.role !== 'admin') {
    return (
      <EmptyState icon="🔒" title="Acesso restrito"
        description="Este painel é exclusivo para administradores do sistema." />
    );
  }
  return <DevPanel />;
}

function DevPanel() {
  const { data: tournaments, isLoading } = useAllTournaments();
  const { data: testCount } = useTestPlayersCount();
  const generate = useGenerateTestPlayers();
  const cleanup = useCleanupTestPlayers();

  const [tournamentId, setTournamentId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [count, setCount] = useState(8);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const { data: groups } = useGroups(tournamentId);
  const createGroup = useCreateDefaultGroup(tournamentId);
  const selectedTournament = tournaments?.find((t) => t.id === tournamentId);

  async function handleGenerate() {
    setError(''); setMessage('');
    if (!tournamentId || !groupId) { setError('Selecione o torneio e o grupo.'); return; }
    try {
      const n = await generate.mutateAsync({ tournamentId, groupId, count });
      setMessage(`✅ ${n} jogadores de teste criados.`);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao gerar jogadores.');
    }
  }

  async function handleCleanup() {
    if (!window.confirm('Remover TODOS os jogadores de teste de TODOS os torneios? Esta ação apaga também as mesas/rodadas onde jogaram.')) return;
    setError(''); setMessage('');
    try {
      const n = await cleanup.mutateAsync();
      setMessage(`🧹 ${n} jogadores de teste removidos.`);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao limpar.');
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">🛠 Painel de desenvolvedor</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gere participantes fictícios para testar torneios rapidamente. Visível só para admin.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {message}
        </p>
      )}

      <div className="card p-5 space-y-4 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Gerar participantes de teste</h2>

        {isLoading ? <PageSpinner /> : (
          <Select label="Torneio" value={tournamentId} onChange={(e) => { setTournamentId(e.target.value); setGroupId(''); }}>
            <option value="">Selecione…</option>
            {(tournaments ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.mode === 'native' ? 'nativo' : 'importado'})</option>
            ))}
          </Select>
        )}

        {tournamentId && (
          !groups?.length ? (
            <Button variant="secondary" size="sm" loading={createGroup.isPending}
              onClick={() => createGroup.mutate('Único')}>
              Criar grupo &quot;Único&quot; primeiro
            </Button>
          ) : (
            <Select label="Grupo" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Selecione…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          )
        )}

        <Input
          label="Quantidade de jogadores"
          type="number" min={1} max={300}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />

        <Button loading={generate.isPending} onClick={handleGenerate} disabled={!tournamentId || !groupId}>
          Gerar {count} jogadores de teste
        </Button>

        {selectedTournament && (
          <a
            href={`/admin/tournaments/${selectedTournament.slug}/rounds`}
            className="block text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            → Ir para as rodadas deste torneio
          </a>
        )}
      </div>

      <div className="card p-5 space-y-2 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Torneio importado (chess-results)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Torneios comuns são sempre nativos. O modo &quot;importado&quot; é exclusivo daqui.
        </p>
        <Link
          href="/admin/tournaments/new/from-chess-results"
          className="inline-block text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
        >
          → Criar torneio importado do chess-results
        </Link>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Limpeza</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {testCount ?? 0} jogador(es) de teste no banco (em todos os torneios).
        </p>
        <Button variant="danger" loading={cleanup.isPending} onClick={handleCleanup} disabled={!testCount}>
          🧹 Limpar todos os jogadores de teste
        </Button>
      </div>
    </div>
  );
}
