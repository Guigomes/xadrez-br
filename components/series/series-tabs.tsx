'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

/** Mesmo contrato visual de TournamentTabs (público). */
export function SeriesTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/series/${slug}`;

  const tabs = [
    { href: base, label: 'Visão geral', icon: '🏅' },
    { href: `${base}/classificacao`, label: 'Classificação', icon: '📊' },
  ];

  return (
    <nav className="grid grid-cols-2 border-b border-gray-200 dark:border-gray-800 -mx-4 sm:mx-0 sm:flex sm:overflow-x-auto sm:gap-0.5 sm:px-0">
      {tabs.map((tab) => {
        const isActive =
          tab.href === base
            ? pathname === base
            : pathname === tab.href || pathname.startsWith(tab.href + '/');
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
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
