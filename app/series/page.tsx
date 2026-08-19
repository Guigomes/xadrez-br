'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSeriesList } from '@/lib/hooks/use-series';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { BR_STATES } from '@/lib/utils/chess';
import {
  SERIES_STATUS_COLOR, SERIES_STATUS_LABEL, describeDimensions, formatSeriesPeriod,
} from '@/lib/utils/series';

export default function SeriesListPage() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const { data: series, isLoading } = useSeriesList({ query, state });

  return (
    <div className="container-app py-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Séries</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Festivais e circuitos: vários torneios com uma classificação acumulada.
        </p>
      </div>

      <div className="mb-6 mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <SearchField value={query} onChange={setQuery} placeholder="Buscar por nome..." />
        </div>
        <div className="sm:w-40">
          <Select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Todos os estados</option>
            {BR_STATES.map((s) => (
              <option key={s.uf} value={s.uf}>{s.uf}</option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : !series?.length ? (
        <EmptyState
          icon="🏅"
          title="Nenhuma série encontrada"
          description="Séries agrupam torneios de um mesmo festival ou circuito e somam a pontuação entre eles."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {series.map((s) => (
            <Link
              key={s.id}
              href={`/series/${s.slug}`}
              className="card p-4 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
            >
              <div className="mb-1">
                <Badge className={SERIES_STATUS_COLOR[s.status]}>{SERIES_STATUS_LABEL[s.status]}</Badge>
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{s.name}</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {[s.city, s.state].filter(Boolean).join(', ')}
                {s.city || s.state ? ' · ' : ''}
                {formatSeriesPeriod(s.start_date, s.end_date)}
              </p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                classifica por {describeDimensions(s.classification_dimensions)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
