'use client';

import { use } from 'react';
import Link from 'next/link';
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
export default function AdminStandingsPage({ params }: Props) {
  const { slug } = use(params);
  return (
    <div>
      <StandingsView slug={slug} />
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
