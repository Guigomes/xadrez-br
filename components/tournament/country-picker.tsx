'use client';

import { useRouter } from '@/i18n/navigation';

/** Troca o país do painel da aba "Por país" (vai para ?pais=XXX, mantendo a ordenação do ranking). */
export function CountryPicker({
  slug,
  current,
  countries,
  keepQuery,
}: {
  slug: string;
  current: string;
  countries: Array<{ code: string; name: string; players: number }>;
  /** Parâmetros de ordenação do ranking a preservar na troca. */
  keepQuery: Record<string, string>;
}) {
  const router = useRouter();
  return (
    <label className="block w-full text-sm text-gray-600 sm:w-auto dark:text-gray-300">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 sm:sr-only dark:text-gray-400">
        Ver país
      </span>
      <span className="relative block">
        <select
          value={current}
          onChange={(e) => {
            const q = new URLSearchParams({ ...keepQuery, pais: e.target.value });
            router.push(`/torneios/${slug}/paises?${q.toString()}#selecao`, { scroll: false });
          }}
          className="w-full appearance-none rounded-xl border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:min-w-52 sm:py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} · {c.players} {c.players === 1 ? 'jogador' : 'jogadores'}
            </option>
          ))}
        </select>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500">
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
}

export function CountryRankingSort({
  current,
  direction,
  reverseHref,
  options,
}: {
  current: string;
  direction: 'asc' | 'desc';
  reverseHref: string;
  options: Array<{ key: string; label: string; href: string }>;
}) {
  const router = useRouter();
  return (
    <label className="block md:hidden">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Ordenar países por
      </span>
      <span className="flex gap-2">
        <span className="relative min-w-0 flex-1">
          <select
            value={current}
            onChange={(e) => {
              const option = options.find((item) => item.key === e.target.value);
              if (option) router.push(option.href, { scroll: false });
            }}
            className="w-full appearance-none rounded-xl border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {options.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500">
            <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <button
          type="button"
          onClick={() => router.push(reverseHref, { scroll: false })}
          aria-label={direction === 'asc' ? 'Ordenar do maior para o menor' : 'Ordenar do menor para o maior'}
          className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-lg font-bold text-gray-600 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          {direction === 'asc' ? '↑' : '↓'}
        </button>
      </span>
    </label>
  );
}
