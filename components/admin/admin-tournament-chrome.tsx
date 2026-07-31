'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminTournamentTabs } from './admin-tournament-tabs';
import { TourResumeLink } from './tour-resume-link';
import { Badge } from '@/components/ui/badge';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import type { TournamentMode, TournamentStatus } from '@/types/database';

interface Props {
  slug: string;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;
  registrationEndDate: string | null;
}

/**
 * Cabeçalho + abas do admin do torneio. Ausente no painel focado de
 * resultados do árbitro (rounds/[roundId]/results) — aquela tela é
 * mobile-first e não deve competir com a navegação por abas.
 */
export function AdminTournamentChrome({ slug, name, mode, status, registrationEndDate }: Props) {
  const pathname = usePathname();
  if (/\/rounds\/[^/]+\/results/.test(pathname)) return null;

  return (
    <div className="mb-6">
      {/* Nome sozinho na própria linha — dividindo a linha com os botões de
          ação (como antes) ele colapsava pra largura zero em telas estreitas:
          truncate liga overflow:hidden, que pelo spec de flexbox zera o
          min-width automático do item, e os botões (shrink-0) levavam todo o
          espaço. O nome do torneio sumia por completo no mobile. */}
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{name}</h1>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Badge className={getTournamentStatusColor(status, registrationEndDate)}>
          {status === 'ongoing' && (
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          )}
          {getTournamentStatusLabel(status, registrationEndDate)}
        </Badge>
        <div className="flex items-center gap-2">
          <TourResumeLink />
          <Link
            href={`/tournaments/${slug}`}
            target="_blank"
            className="shrink-0 rounded-lg bg-brand-50 dark:bg-brand-950/50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/50"
          >
            Ver público
          </Link>
        </div>
      </div>
      <div className="mt-4">
        <AdminTournamentTabs slug={slug} mode={mode} status={status} />
      </div>
    </div>
  );
}
