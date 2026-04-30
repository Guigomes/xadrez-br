'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useUser, useSignOut } from '@/lib/hooks/use-auth';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { href: '/tournaments', label: 'Torneios' },
    { href: '/players',     label: 'Jogadores' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90">
      <div className="container-app flex h-14 items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/?home=1" className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-300">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-brand-600 text-white shadow-sm">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h4a1 1 0 001-1v-3h2v3a1 1 0 001 1h4a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          </span>
          <span className="hidden sm:inline tracking-tight">XadrezBR</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith(link.href)
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 text-xs font-bold">
                  {user.email?.[0]?.toUpperCase()}
                </span>
                <span className="hidden sm:inline">Minha conta</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                  <Link
                    href="/admin"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    onClick={() => setMenuOpen(false)}
                  >
                    Painel do organizador
                  </Link>
                  <hr className="my-1 border-gray-200 dark:border-gray-800" />
                  <button
                    onClick={() => { signOut.mutate(); setMenuOpen(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    Sair
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Entrar
            </Link>
          )}

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 pb-3 pt-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <Link
              href="/admin"
              className="block py-2 text-sm font-medium text-brand-600 dark:text-brand-400"
              onClick={() => setMenuOpen(false)}
            >
              Painel do organizador
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
