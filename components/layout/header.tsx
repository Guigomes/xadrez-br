'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { useUser, useSignOut } from '@/lib/hooks/use-auth';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function Header() {
  const pathname = usePathname();
  const { user } = useUser();
  const signOut = useSignOut();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const navLinks = [
    { href: '/tournaments', label: 'Torneios' },
    { href: '/players',     label: 'Jogadores' },
    { href: '/noticias',    label: 'Notícias' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90">
      <div className="container-app flex h-14 items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/?home=1" className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-300">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-brand-600 text-white shadow-sm text-lg leading-none">
            ♞
          </span>
          <span className="hidden sm:inline tracking-tight">Torneios Xadrez BR</span>
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

          {user && (
            <Link
              href="/admin"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Painel
            </Link>
          )}

          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 text-xs font-bold">
                  {user.email?.[0]?.toUpperCase()}
                </span>
                <span className="hidden sm:inline">Minha conta</span>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                  <Link
                    href="/admin"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    onClick={() => setDropdownOpen(false)}
                  >
                    Painel do organizador
                  </Link>
                  <Link
                    href="/account"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    onClick={() => setDropdownOpen(false)}
                  >
                    Minha conta
                  </Link>
                  <hr className="my-1 border-gray-200 dark:border-gray-800" />
                  <button
                    onClick={() => { signOut.mutate(); setDropdownOpen(false); }}
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
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav with transition */}
      <div
        className={cn(
          'md:hidden overflow-hidden transition-all duration-200 ease-in-out',
          mobileOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 pb-3 pt-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <>
              <Link
                href="/admin"
                className="block py-2 text-sm font-medium text-brand-600 dark:text-brand-400"
                onClick={() => setMobileOpen(false)}
              >
                Painel do organizador
              </Link>
              <Link
                href="/account"
                className="block py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                onClick={() => setMobileOpen(false)}
              >
                Minha conta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
