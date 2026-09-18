'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useUser } from '@/lib/hooks/use-auth';

export function Footer() {
  const { user } = useUser();
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 mt-16">
      <div className="container-app py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span className="text-lg">♟</span>
          <span>{t('copyright', { year: new Date().getFullYear() })}</span>
        </div>
        <div className="flex gap-4">
          <Link href="/tournaments" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            {t('tournaments')}
          </Link>
          <Link href="/players" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            {t('players')}
          </Link>
          <Link href={user ? '/admin' : '/login'} className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            {t('organizers')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
