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

  const tabs = isOngoing
    ? [
        { href: `${base}/rounds/${currentRoundNumber}`, label: 'Rodada atual', icon: '⚡' },
        { href: `${base}/standings`,                    label: 'Classificação', icon: '📊' },
        { href: `${base}/rounds`,                       label: 'Rodadas',       icon: '📋' },
        { href: `${base}/participants`,                 label: 'Participantes', icon: '👥' },
      ]
    : [
        { href: base,                   label: 'Visão geral',   icon: '🏆' },
        { href: `${base}/participants`, label: 'Participantes', icon: '👥' },
        { href: `${base}/rounds`,       label: 'Rodadas',       icon: '📋' },
        { href: `${base}/standings`,    label: 'Classificação', icon: '📊' },
      ];

  return (
    <nav className="grid grid-cols-2 border-b border-gray-200 dark:border-gray-800 -mx-4 sm:mx-0 sm:flex sm:overflow-x-auto sm:gap-0.5 sm:px-0">
      {tabs.map((tab) => {
        const isActive = tab.href === base
          ? pathname === base
          : tab.label === 'Rodada atual'
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-3 text-xs font-medium border-b-2 transition-colors',
              'sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm sm:whitespace-nowrap',
              isActive
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            <span className="text-xl sm:text-base">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
