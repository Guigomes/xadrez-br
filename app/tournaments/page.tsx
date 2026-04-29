'use client';

import { useState } from 'react';
import { TournamentCard } from '@/components/tournament/tournament-card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useTournamentList } from '@/lib/hooks/use-tournament';
import { BR_STATES } from '@/lib/utils/chess';
import type { TournamentStatus } from '@/types/database';

export default function TournamentsPage() {
  const [query,  setQuery]  = useState('');
  const [state,  setState]  = useState('');
  const [status, setStatus] = useState<TournamentStatus | ''>('');

  const { data: tournaments, isLoading, isFetching, isError } = useTournamentList({
    query:  query  || undefined,
    state:  state  || undefined,
    status: status || undefined,
  });

  return (
    <div className="container-app py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Torneios</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Encontre torneios de xadrez no Brasil
        </p>
        {isFetching && !isLoading && (
          <p className="text-xs text-brand-600 dark:text-brand-400 mt-2 animate-pulse">
            Atualizando resultados...
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <Input
          placeholder="Buscar por nome ou cidade..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:col-span-1"
        />
        <Select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Todos os estados</option>
          {BR_STATES.map((s) => (
            <option key={s.uf} value={s.uf}>{s.uf} – {s.name}</option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as TournamentStatus | '')}>
          <option value="">Todos os status</option>
          <option value="ongoing">Em andamento</option>
          <option value="registration">Inscrições abertas</option>
          <option value="finished">Encerrados</option>
        </Select>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-800 mb-3" />
              <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800 mb-4" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-3 rounded bg-gray-100 dark:bg-gray-900" />
                <div className="h-3 rounded bg-gray-100 dark:bg-gray-900" />
                <div className="h-3 rounded bg-gray-100 dark:bg-gray-900" />
                <div className="h-3 rounded bg-gray-100 dark:bg-gray-900" />
              </div>
            </div>
          ))}
        </div>
      )}
      {isError && (
        <EmptyState icon="⚠️" title="Erro ao carregar torneios" description="Tente novamente em instantes." />
      )}
      {!isLoading && !isError && (
        <>
          {(tournaments?.length ?? 0) === 0 ? (
            <EmptyState
              icon="🔍"
              title="Nenhum torneio encontrado"
              description="Tente outros filtros ou aguarde novos torneios serem publicados."
            />
          ) : (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                {tournaments?.length} torneio{(tournaments?.length ?? 0) !== 1 ? 's' : ''} encontrado{(tournaments?.length ?? 0) !== 1 ? 's' : ''}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tournaments?.map((t) => (
                  <TournamentCard key={t.id} tournament={t} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
