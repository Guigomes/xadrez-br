'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import type { TournamentMode, TournamentStatus } from '@/types/database';

interface Props {
  slug: string;
  mode: TournamentMode;
  status: TournamentStatus;
}

/** Abas do admin do torneio — mesmo padrão visual de TournamentTabs (público). */
export function AdminTournamentTabs({ slug, mode, status }: Props) {
  const pathname = usePathname();
  const base = `/admin/tournaments/${slug}`;

  // Rodadas só aparece com o torneio de fato em andamento ou já encerrado —
  // antes disso (draft/published/registration/registration_closed) é uma aba
  // vazia competindo por atenção com Editar/Inscrições, que é onde o
  // organizador ainda está.
  const hasStarted = status === 'ongoing' || status === 'finished';

  const tabs = [
    { href: `${base}/edit`,          label: 'Editar',        icon: '⚙️' },
    { href: `${base}/registrations`, label: 'Inscrições',    icon: '📝' },
    { href: `${base}/players`,       label: 'Participantes', icon: '👥' },
    { href: `${base}/staff`,         label: 'Árbitros',      icon: '⚖️' },
    ...(hasStarted
      ? [{ href: `${base}/rounds`, label: 'Rodadas', icon: '📋' }]
      : []),
    ...(mode === 'imported'
      ? [{ href: `${base}/imports`, label: 'Importações', icon: '🔄' }]
      : []),
  ];

  return (
    <nav className="grid grid-cols-3 border-b border-gray-200 dark:border-gray-800 -mx-4 sm:mx-0 sm:flex sm:flex-wrap sm:overflow-x-auto sm:gap-0.5 sm:px-0">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex flex-row items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
              'sm:px-4 sm:py-2.5 sm:text-sm sm:whitespace-nowrap',
              isActive
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            <span className="text-base">{tab.icon}</span>
            <span className="sm:hidden">{'shortLabel' in tab ? tab.shortLabel : tab.label}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
