'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import { useUnreadChatCount } from '@/lib/hooks/use-chat';

/** Abas da área logada: Minha área · Mensagens (com selo de não lidas) · Alertas · Relatórios. Mesmo desenho das abas do torneio. */
export function PlayerAreaTabs() {
  const pathname = usePathname();
  const { data: unread = 0 } = useUnreadChatCount(true);
  const tabs = [
    { href: '/minha-area', label: 'Minha área', active: pathname === '/minha-area' },
    { href: '/minha-area/mensagens', label: 'Mensagens', active: pathname.startsWith('/minha-area/mensagens'), badge: unread },
    { href: '/alertas', label: 'Alertas', active: pathname.startsWith('/alertas') },
    { href: '/relatorios', label: 'Relatórios', active: pathname.startsWith('/relatorios') },
  ];
  return (
    <nav className="mb-6 flex overflow-x-auto border-b border-gray-200 dark:border-gray-800">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            'flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            tab.active
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
          )}
        >
          {tab.label}
          {!!tab.badge && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white">
              {tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
