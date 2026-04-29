import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 mt-16">
      <div className="container-app py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span className="text-lg">♟</span>
          <span>XadrezBR © {new Date().getFullYear()}</span>
        </div>
        <div className="flex gap-4">
          <Link href="/tournaments" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            Torneios
          </Link>
          <Link href="/players" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            Jogadores
          </Link>
          <Link href="/login" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            Organizadores
          </Link>
        </div>
      </div>
    </footer>
  );
}
