import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StandingsView } from '@/components/tournament/standings-view';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Classificação na visão do organizador — mesma tela do público
 * (components/tournament/standings-view.tsx), só que dentro do painel admin.
 * Existe porque, com o torneio em andamento, acompanhar a classificação é
 * parte do trabalho: sem esta aba o organizador tinha que sair pro site
 * público pra ver o resultado do que acabou de lançar.
 */
export default async function AdminStandingsPage({ params }: Props) {
  const { slug } = await params;

  // Só o id, pra StandingsView disparar a query de classificação de cara em
  // vez de esperar o useTournament resolver primeiro (waterfall no cliente).
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from('tournaments').select('id').eq('slug', slug).single();

  return (
    <div>
      <StandingsView slug={slug} showExport tournamentId={tournament?.id} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/tournaments/${slug}/standings/print`}
          target="_blank"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-9 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          🖨️ Imprimir classificação
        </Link>
        <Link
          href={`/tournaments/${slug}/standings`}
          target="_blank"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-9 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          🔗 Ver como o público vê
        </Link>
      </div>
    </div>
  );
}
