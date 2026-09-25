'use client';

import { usePathname, Link } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { TournamentTabIcon, type TournamentTabIconName } from './tournament-tab-icon';

interface TournamentTabsProps {
  slug: string;
  roundsCount: number;
}

export function TournamentTabs({ slug, roundsCount }: TournamentTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = `/torneios/${slug}`;
  const selectedGroupId = searchParams.get('group');

  // A ordem não muda no meio do torneio: memória espacial é mais útil que
  // promover a rodada atual e fazer as outras abas "andarem". As telas vazias
  // também ficam acessíveis antes da estreia, agora com mensagens próprias.
  const tabs = [
    { href: base,                   label: 'Visão geral', icon: 'overview' as TournamentTabIconName },
    { href: `${base}/participants`, label: 'Participantes', icon: 'participants' as TournamentTabIconName },
    { href: `${base}/rounds`,       label: `Rodadas · ${roundsCount}`, icon: 'rounds' as TournamentTabIconName },
    { href: `${base}/standings`,    label: 'Classificação', icon: 'standings' as TournamentTabIconName },
  ];

  function hrefWithContext(href: string) {
    return selectedGroupId ? `${href}?group=${encodeURIComponent(selectedGroupId)}` : href;
  }

  return (
    <nav className="grid grid-cols-2 border-b border-gray-200 dark:border-gray-800 -mx-4 sm:mx-0 sm:flex sm:flex-wrap sm:gap-0.5 sm:px-0">
      {tabs.map((tab) => {
        const isActive = tab.href === base
          ? pathname === base
          : pathname === tab.href || (tab.label !== 'Rodadas' && pathname.startsWith(tab.href + '/'));
        return (
          <Link
            key={tab.href}
            href={hrefWithContext(tab.href)}
            className={cn(
              'flex min-h-11 flex-row items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors',
              'sm:px-4 sm:py-2.5 sm:text-sm sm:whitespace-nowrap',
              isActive
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            <TournamentTabIcon name={tab.icon} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
