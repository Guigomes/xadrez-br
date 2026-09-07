'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

interface TournamentTabsProps {
  slug: string;
  roundsCount: number;
  status?: string;
  currentRoundNumber?: number | null;
}

export function TournamentTabs({ slug, status, currentRoundNumber }: TournamentTabsProps) {
  const pathname = usePathname();
  const base = `/tournaments/${slug}`;

  const isOngoing = status === 'ongoing' && currentRoundNumber != null;
  // Antes de o torneio começar não existe rodada nem pontuação: as duas abas
  // só levariam a telas vazias ("Nenhuma rodada criada" / "Classificação não
  // disponível"). Aparecem quando há o que mostrar.
  const hasStarted = status === 'ongoing' || status === 'finished';

  const tabs = isOngoing
    ? [
        { href: `${base}/rounds/${currentRoundNumber}`, label: 'Rodada atual' },
        { href: `${base}/standings`,                    label: 'Classificação' },
        { href: `${base}/participants`,                 label: 'Participantes' },
        { href: base,                                   label: 'Visão geral' },
      ]
    : [
        { href: base,                   label: 'Visão geral' },
        { href: `${base}/participants`, label: 'Participantes' },
        ...(hasStarted
          ? [
              { href: `${base}/rounds`,    label: 'Rodadas' },
              { href: `${base}/standings`, label: 'Classificação' },
            ]
          : []),
      ];

  return (
    <nav className="grid grid-cols-2 border-b border-gray-200 dark:border-gray-800 -mx-4 sm:mx-0 sm:flex sm:flex-wrap sm:gap-0.5 sm:px-0">
      {tabs.map((tab) => {
        const isActive = tab.href === base
          ? pathname === base
          : pathname === tab.href || (tab.label !== 'Rodadas' && pathname.startsWith(tab.href + '/'));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex min-h-11 flex-row items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors',
              'sm:px-4 sm:py-2.5 sm:text-sm sm:whitespace-nowrap',
              isActive
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
