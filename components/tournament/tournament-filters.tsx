'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BR_STATES } from '@/lib/utils/chess';
import type { TournamentStatus } from '@/types/database';

/**
 * Só os controles são client — a lista em si passou a ser renderizada no
 * servidor (app/tournaments/page.tsx). O estado dos filtros vive na URL, então
 * o resultado é compartilhável, sobrevive ao "voltar" do navegador e chega
 * pronto no primeiro HTML em vez de depender de hidratar pra buscar.
 */
export function TournamentFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const state = params.get('uf') ?? '';
  const status = params.get('status') ?? '';

  // A busca por texto é digitada letra a letra — sem debounce, cada tecla
  // viraria uma navegação. Estado (select) não precisa: muda de uma vez só.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (query === current) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query) next.set('q', query);
      else next.delete('q');
      startTransition(() => router.replace(`/tournaments?${next.toString()}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(t);
  }, [query, params, router]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`/tournaments?${next.toString()}`, { scroll: false }));
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <Input
          placeholder="Buscar por nome ou cidade..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:col-span-1"
          aria-label="Buscar torneios"
        />
        <Select value={state} onChange={(e) => setParam('uf', e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos os estados</option>
          {BR_STATES.map((s) => (
            <option key={s.uf} value={s.uf}>{s.uf} – {s.name}</option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setParam('status', e.target.value as TournamentStatus | '')}
          aria-label="Filtrar por situação"
        >
          <option value="">Todos os status</option>
          <option value="published">Publicados</option>
          <option value="registration">Inscrições abertas</option>
          <option value="registration_closed">Inscrições encerradas</option>
          <option value="ongoing">Em andamento</option>
          <option value="finished">Encerrados</option>
        </Select>
      </div>
      {isPending && (
        <p className="text-xs text-brand-600 dark:text-brand-400 -mt-3 mb-3 animate-pulse">
          Atualizando resultados...
        </p>
      )}
    </>
  );
}
