'use client';

import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Select } from '@/components/ui/select';
import { BR_STATES } from '@/lib/utils/chess';

// '' = próximos e em andamento (a visão padrão de uma agenda). "Encerrados" é a
// única que olha pro passado — por isso a página inverte a ordem nela.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'registration', label: 'Inscrições abertas' },
  { value: 'ongoing', label: 'Em andamento' },
  { value: 'published', label: 'Em breve' },
  { value: 'registration_closed', label: 'Inscrições encerradas' },
  { value: 'finished', label: 'Encerrados' },
];

/** Estado dos filtros na URL (/agenda?status=…&uf=…): compartilhável e renderizado no servidor. */
export function AgendaFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const state = params.get('uf') ?? '';
  const status = params.get('status') ?? '';

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    startTransition(() => router.replace(`/agenda${qs ? `?${qs}` : ''}`, { scroll: false }));
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full min-w-0 sm:w-64">
          <Select value={state} onChange={(e) => setParam('uf', e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos os estados</option>
            {BR_STATES.map((s) => (
              <option key={s.uf} value={s.uf}>{s.uf} – {s.name}</option>
            ))}
          </Select>
        </div>
        {isPending && (
          <span className="animate-pulse text-xs text-brand-600 dark:text-brand-400">Atualizando…</span>
        )}
      </div>

      {/* Chips rolam na horizontal no celular em vez de quebrar em 3 linhas. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filtrar por situação">
        <div className="flex gap-2 whitespace-nowrap pb-1">
          {STATUS_OPTIONS.map((o) => {
            const active = status === o.value;
            return (
              <button
                key={o.value || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setParam('status', o.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-700'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
