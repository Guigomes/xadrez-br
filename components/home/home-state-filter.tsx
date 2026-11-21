'use client';

import { useRouter } from '@/i18n/navigation';
import { useTransition } from 'react';
import { Select } from '@/components/ui/select';
import { BR_STATES } from '@/lib/utils/chess';
import { savePreferredState } from '@/lib/utils/preferred-state';

/**
 * Filtro de estado da tela inicial. A escolha fica no cookie (ver
 * preferred-state.ts) e a home relê no servidor com router.refresh(), então a
 * próxima visita já abre no mesmo estado.
 */
export function HomeStateFilter({ value }: { value: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <div className="w-full sm:w-64">
        <Select
          value={value ?? ''}
          onChange={(e) => {
            savePreferredState(e.target.value);
            startTransition(() => router.refresh());
          }}
          aria-label="Filtrar torneios por estado"
          disabled={isPending}
        >
          <option value="">Todos os estados</option>
          {BR_STATES.map((s) => (
            <option key={s.uf} value={s.uf}>{s.uf} – {s.name}</option>
          ))}
        </Select>
      </div>
      {isPending && (
        <span className="text-xs text-brand-600 animate-pulse dark:text-brand-400">Atualizando...</span>
      )}
    </div>
  );
}
