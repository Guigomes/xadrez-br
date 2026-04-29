'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePlayerSearch } from '@/lib/hooks/use-player';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';

export default function PlayersPage() {
  const [query, setQuery] = useState('');
  const { data: players, isLoading } = usePlayerSearch(query);

  return (
    <div className="container-app py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Buscar jogador</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Digite o nome do jogador para ver seu perfil e histórico de torneios.
        </p>
      </div>

      <div className="mb-6">
        <Input
          placeholder="Nome do jogador..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="text-base h-12"
          autoFocus
        />
        {query.length > 0 && query.length < 2 && (
          <p className="text-xs text-gray-400 mt-1.5">Digite pelo menos 2 caracteres</p>
        )}
      </div>

      {isLoading && query.length >= 2 && <PageSpinner />}

      {!isLoading && query.length >= 2 && (players?.length ?? 0) === 0 && (
        <EmptyState
          icon="🔍"
          title="Nenhum jogador encontrado"
          description={`Nenhum jogador com "${query}" no nome.`}
        />
      )}

      {(players?.length ?? 0) > 0 && (
        <div className="card divide-y divide-gray-100 dark:divide-gray-800/60">
          {players!.map((player) => (
            <Link
              key={player.id}
              href={`/players/${player.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{player.full_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {[
                    player.state,
                    player.rating_std ? `Rating ${player.rating_std}` : null,
                    player.cbx_id ? `CBX ${player.cbx_id}` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <svg className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {!query && (
        <div className="mt-10 p-5 rounded-xl bg-brand-50 dark:bg-brand-950/30 text-center">
          <p className="text-2xl mb-2">♟</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Acompanhe qualquer jogador no torneio
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Digite o nome para ver classificação, emparceiramentos e resultados.
          </p>
        </div>
      )}
    </div>
  );
}
