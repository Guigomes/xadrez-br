'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminTournamentTabs } from './admin-tournament-tabs';
import type { TournamentMode } from '@/types/database';

interface Props {
  slug: string;
  name: string;
  mode: TournamentMode;
}

/**
 * Cabeçalho + abas do admin do torneio. Ausente no painel focado de
 * resultados do árbitro (rounds/[roundId]/results) — aquela tela é
 * mobile-first e não deve competir com a navegação por abas.
 */
export function AdminTournamentChrome({ slug, name, mode }: Props) {
  const pathname = usePathname();
  if (/\/rounds\/[^/]+\/results/.test(pathname)) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{name}</h1>
        <Link
          href={`/tournaments/${slug}`}
          target="_blank"
          className="shrink-0 rounded-lg bg-brand-50 dark:bg-brand-950/50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/50"
        >
          Ver público
        </Link>
      </div>
      <AdminTournamentTabs slug={slug} mode={mode} />
    </div>
  );
}
