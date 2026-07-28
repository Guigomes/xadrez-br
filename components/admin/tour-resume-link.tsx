'use client';

import { useRouter } from 'next/navigation';
import { TOUR_STEPS } from '@/lib/tour/steps';
import { writeProgress } from '@/lib/tour/state';

/**
 * Botão de ajuda dentro de um torneio já existente — chama de volta pro
 * início do tour completo em /admin.
 *
 * Diferente de <TourLauncher> (o de /admin, que inicia o tour na própria
 * rota): aqui sempre há navegação envolvida, então não precisa do truque do
 * evento — gravar o progresso e trocar de rota já basta. A mudança de
 * pathname é o que faz <TournamentTour /> (montado no layout, ancestral
 * comum) reavaliar e mostrar o primeiro passo assim que a página carrega.
 */
export function TourResumeLink() {
  const router = useRouter();

  function start() {
    writeProgress(TOUR_STEPS[0].id);
    router.push('/admin');
  }

  return (
    <button
      type="button"
      onClick={start}
      className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      ❔ Dicas de como criar um torneio
    </button>
  );
}
