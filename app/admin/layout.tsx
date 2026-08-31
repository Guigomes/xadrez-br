import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TournamentTour } from '@/components/admin/tournament-tour';
import { getSessionUser, getSessionProfile } from '@/lib/data/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Ambos memoizados por request (lib/data/session.ts): o layout raiz já pediu
  // o usuário, e as páginas abaixo pedem o perfil — nenhuma dessas repete o
  // round-trip dentro do mesmo render.
  const user = await getSessionUser();

  if (!user) redirect('/login');

  const typedProfile = await getSessionProfile();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Admin sub-header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="container-app py-2 flex items-center gap-3 text-sm">
          <Link href="/admin" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            Painel
          </Link>
          <span className="text-gray-300 dark:text-gray-700">/</span>
          <span className="text-gray-700 dark:text-gray-300">
            {typedProfile?.role === 'admin' ? 'Administrador' : 'Organizador'}
          </span>
        </div>
      </div>

      {/* pb extra no mobile: o mascote flutuante (ChatBubble, fixed bottom-4
          right-4) cobria o canto do último card. O respiro deixa a última
          linha rolar acima dele. */}
      <div className="container-app py-8 pb-28 sm:pb-8">{children}</div>

      {/* Fica aqui, e não numa página, porque o tour atravessa quatro rotas
          (/admin, /new, /[slug]/edit, /[slug]/players) — este layout é o
          ancestral comum das quatro e não remonta entre elas. */}
      <TournamentTour />
    </div>
  );
}
