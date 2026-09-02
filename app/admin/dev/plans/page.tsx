'use client';

import { useState } from 'react';
import { useProfile } from '@/lib/hooks/use-auth';
import { usePlanCatalog, useUserPlanSearch, useSetUserPlan } from '@/lib/hooks/use-plans';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';

export default function PlansAdminPage() {
  const { data: profile, isLoading: loadingProfile } = useProfile();

  if (loadingProfile) return <PageSpinner />;
  if (profile?.role !== 'admin') {
    return (
      <EmptyState icon="🔒" title="Acesso restrito"
        description="Este painel é exclusivo para administradores do sistema." />
    );
  }
  return <PlansPanel />;
}

function PlansPanel() {
  const [query, setQuery] = useState('');
  const { data: candidates, isLoading } = useUserPlanSearch(query);
  const { data: plans } = usePlanCatalog();
  const setPlan = useSetUserPlan();

  const [pendingCode, setPendingCode] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSetPlan(userId: string) {
    const code = pendingCode[userId];
    if (!code) return;
    setError(''); setMessage('');
    try {
      await setPlan.mutateAsync({ userId, planCode: code });
      setMessage('✅ Plano atualizado.');
    } catch (e: any) {
      setError(e.message ?? 'Erro ao trocar plano.');
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">🎟️ Planos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Busca por nome ou e-mail e troca o plano de assinatura de um usuário.
          Sem cobrança ainda — é a única forma de mudar de nível por ora.
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

      <div className="card p-5 space-y-4">
        <Input
          label="Buscar usuário"
          placeholder="Nome ou e-mail (mínimo 3 letras)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {query.trim().length > 0 && query.trim().length < 3 && (
          <p className="text-xs text-gray-400">Digite pelo menos 3 caracteres.</p>
        )}

        {isLoading && query.trim().length >= 3 && <PageSpinner />}

        {!isLoading && query.trim().length >= 3 && (candidates?.length ?? 0) === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum usuário encontrado.</p>
        )}

        {(candidates?.length ?? 0) > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {candidates!.map((c) => (
              <li key={c.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {c.full_name || '(sem nome)'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {c.email} · plano atual: <span className="font-medium text-gray-600 dark:text-gray-300">{c.plan_name ?? '—'}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    aria-label={`Novo plano para ${c.full_name ?? c.email}`}
                    value={pendingCode[c.id] ?? c.plan_code ?? ''}
                    onChange={(e) => setPendingCode((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="w-40"
                  >
                    {(plans ?? []).map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    loading={setPlan.isPending}
                    disabled={!pendingCode[c.id] || pendingCode[c.id] === c.plan_code}
                    onClick={() => handleSetPlan(c.id)}
                  >
                    Salvar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
