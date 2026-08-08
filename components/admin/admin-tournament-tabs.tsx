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

/**
 * Ícones vetoriais das abas — outline monocromático (stroke=currentColor), no
 * mesmo estilo/cor da aba, herdando a cor ativa/inativa via CSS. Trocaram os
 * emojis coloridos (🏆🔀📝👥⚖️) por SVG pra dar visual uniforme e minimalista.
 */
const TAB_ICONS: Record<string, React.ReactNode> = {
  overview: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8m-4-4v4m5-17H7v5a5 5 0 0010 0V4zM7 4H4v2a3 3 0 003 3m10-5h3v2a3 3 0 01-3 3" />
  ),
  pairing: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 3h5v5m0-5l-7 7M4 20l7-7m5 8h5v-5m0 5l-6-6M4 4l6 6" />
  ),
  registrations: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  ),
  players: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  ),
  staff: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v18m0-18l7 3m-7-3L5 6m0 0l-3 7a3 3 0 006 0L5 6zm14 0l-3 7a3 3 0 006 0l-3-7zM4 21h16" />
  ),
  rounds: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  ),
  imports: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  ),
};

/** Abas do admin do torneio — mesmo padrão visual de TournamentTabs (público). */
export function AdminTournamentTabs({ slug, mode, status }: Props) {
  const pathname = usePathname();
  const base = `/admin/tournaments/${slug}`;

  // Rodadas só aparece com o torneio de fato em andamento ou já encerrado —
  // antes disso (draft/published/registration/registration_closed) é uma aba
  // vazia competindo por atenção com Visão geral/Inscrições, que é onde o
  // organizador ainda está.
  const hasStarted = status === 'ongoing' || status === 'finished';

  const tabs = [
    { href: base,                    label: 'Visão geral',     icon: TAB_ICONS.overview },
    { href: `${base}/groups`,        label: 'Emparceiramento', icon: TAB_ICONS.pairing },
    { href: `${base}/registrations`, label: 'Inscrições',      icon: TAB_ICONS.registrations },
    { href: `${base}/players`,       label: 'Participantes',   icon: TAB_ICONS.players },
    { href: `${base}/staff`,         label: 'Árbitros',        icon: TAB_ICONS.staff },
    ...(hasStarted
      ? [{ href: `${base}/rounds`, label: 'Rodadas', icon: TAB_ICONS.rounds }]
      : []),
    ...(mode === 'imported'
      ? [{ href: `${base}/imports`, label: 'Importações', icon: TAB_ICONS.imports }]
      : []),
  ];

  return (
    <nav className="grid grid-cols-3 border-b border-gray-200 dark:border-gray-800 -mx-4 sm:mx-0 sm:flex sm:flex-wrap sm:overflow-x-auto sm:gap-0.5 sm:px-0">
      {tabs.map((tab) => {
        // "Visão geral" mora na raiz (href === base), que é PREFIXO de todas
        // as outras abas (${base}/edit, ${base}/groups, ...) — sem esse
        // caso especial, o startsWith abaixo marcaria ela como ativa em
        // qualquer sub-rota também. Mesmo tratamento de components/tournament/
        // tournament-tabs.tsx (público).
        const isActive = tab.href === base
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
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              {tab.icon}
            </svg>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
