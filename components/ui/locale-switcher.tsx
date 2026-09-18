'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';

// Cada idioma no PRÓPRIO idioma (não traduzido) — convenção universal de
// seletor de idioma. docs/plano-i18n.md §4.2: com 3 locales o toggle de dois
// estados não serve mais, vira dropdown.
const LOCALE_LABELS: Record<AppLocale, string> = {
  'pt-BR': 'Português',
  es: 'Español',
  en: 'English',
};

export function LocaleSwitcher() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Mesmo padrão de "fechar ao clicar fora" do dropdown de conta do header
  // (components/layout/header.tsx) — não reinventa.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function switchTo(next: AppLocale) {
    setOpen(false);
    // Preserva pathname e query; grava o cookie NEXT_LOCALE (escolha
    // explícita — passa a valer sobre geo/Accept-Language, docs/plano-
    // i18n.md §1.4 prioridade 1).
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Idioma"
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1 p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z" />
        </svg>
        <span className="hidden sm:inline text-sm font-medium">{locale === 'pt-BR' ? 'PT' : locale.toUpperCase()}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900 z-50">
          {routing.locales.map((l) => (
            <button
              key={l}
              onClick={() => switchTo(l)}
              className={
                'block w-full text-left min-h-11 px-4 py-2.5 text-sm ' +
                (l === locale
                  ? 'font-semibold text-brand-700 dark:text-brand-300'
                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800')
              }
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
