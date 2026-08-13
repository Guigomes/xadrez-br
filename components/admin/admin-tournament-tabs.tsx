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
 * Abas do admin do torneio — mesmo padrão visual de TournamentTabs (público),
 * emoji incluso: os SVG monocromáticos que moravam aqui herdavam a cor da aba
 * (verde quando ativa, cinza quando não), e o organizador preferiu o visual
 * colorido que o público já tinha. Um jogo de ícones só nos dois lados.
 */
export function AdminTournamentTabs({ slug, mode, status }: Props) {
  const pathname = usePathname();
  const base = `/admin/tournaments/${slug}`;

  // A partir do torneio em andamento a montagem acabou: Emparceiramento e
  // Inscrições viram abas que não mudam mais nada (as telas já congelam por
  // status), e o que passa a importar é tocar as rodadas e acompanhar o
  // resultado. Por isso as duas somem e entram Rodadas e Classificação. As
  // rotas continuam existindo — some a navegação, não o acesso por link.
  const hasStarted = status === 'ongoing' || status === 'finished';

  const tabs = [
    { href: base,              label: 'Visão geral',   icon: '🏆' },
    ...(hasStarted
      ? []
      : [
          { href: `${base}/groups`,        label: 'Emparceiramento', icon: '🔀' },
          { href: `${base}/registrations`, label: 'Inscrições',      icon: '📝' },
        ]),
    { href: `${base}/players`, label: 'Participantes', icon: '👥' },
    ...(hasStarted
      ? [
          { href: `${base}/rounds`,    label: 'Rodadas',       icon: '📋' },
          { href: `${base}/standings`, label: 'Classificação', icon: '📊' },
        ]
      : []),
    { href: `${base}/staff`,   label: 'Árbitros',      icon: '⚖️' },
    ...(mode === 'imported'
      ? [{ href: `${base}/imports`, label: 'Importações', icon: '🔄' }]
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
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
