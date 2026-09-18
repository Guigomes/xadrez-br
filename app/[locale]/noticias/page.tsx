'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { NewsCard } from '@/components/news/news-card';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useNewsList } from '@/lib/hooks/use-news';
import { BR_STATES } from '@/lib/utils/chess';
import type { NewsScope } from '@/types/database';

type Filter = NewsScope | 'all';

const CHIPS: { value: Filter; label: string }[] = [
  { value: 'all',           label: 'Todas' },
  { value: 'national',      label: 'Nacional' },
  { value: 'international', label: 'Internacional' },
];

export default function NewsListPage() {
  const [scope, setScope] = useState<Filter>('all');
  const [state, setState] = useState('');

  const { data: news, isLoading, isError } = useNewsList({
    scope,
    state: scope === 'state' ? state || null : null,
  });

  // Escolher uma UF implica filtrar só estaduais; limpar volta pra "Todas".
  function handleState(uf: string) {
    setState(uf);
    setScope(uf ? 'state' : 'all');
  }

  function handleChip(value: Filter) {
    setScope(value);
    if (value !== 'state') setState('');
  }

  return (
    <div className="container-app py-8">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">Notícias</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Xadrez no seu estado, no Brasil e no mundo
        </p>
      </div>

      {/* Filtro de abrangência */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => handleChip(chip.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              scope === chip.value
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
            )}
          >
            {chip.label}
          </button>
        ))}
        <Select
          value={state}
          onChange={(e) => handleState(e.target.value)}
          className="h-8 w-auto text-xs"
        >
          <option value="">Por estado…</option>
          {BR_STATES.map((s) => (
            <option key={s.uf} value={s.uf}>{s.uf} – {s.name}</option>
          ))}
        </Select>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="mb-3 h-28 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="mb-2 h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-900" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <EmptyState icon="⚠️" title="Erro ao carregar notícias" description="Tente novamente em instantes." />
      )}

      {!isLoading && !isError && (
        (news?.length ?? 0) === 0 ? (
          <EmptyState
            icon="📰"
            title="Nenhuma notícia por aqui"
            description={scope === 'all'
              ? 'Ainda não há notícias publicadas.'
              : 'Nenhuma notícia com esse filtro. Tente outra abrangência.'}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {news!.map((n) => <NewsCard key={n.id} news={n} />)}
          </div>
        )
      )}
    </div>
  );
}
