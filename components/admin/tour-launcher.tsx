'use client';

import { useEffect } from 'react';
import { TOUR_STEPS } from '@/lib/tour/steps';
import { writeProgress, shouldAutoStart, TOUR_START_EVENT } from '@/lib/tour/state';

/**
 * Inicia o tour da criação de torneio: abre sozinho para quem nunca criou um,
 * e fica disponível como botão para quem quiser rever.
 *
 * O arranque grava o progresso ANTES de disparar o evento de propósito. Efeitos
 * do React rodam de baixo para cima — este componente (filho, dentro da página)
 * monta antes do <TournamentTour /> (no layout), então um evento disparado no
 * mount não teria ouvinte. Gravando o progresso, o tour encontra o estado
 * pendente quando o efeito dele finalmente roda. O evento cobre o outro caso:
 * o clique manual, quando o ouvinte já existe.
 */
export function TourLauncher({ firstTime }: { firstTime: boolean }) {
  useEffect(() => {
    if (shouldAutoStart(firstTime)) start();
  }, [firstTime]);

  function start() {
    writeProgress(TOUR_STEPS[0].id);
    window.dispatchEvent(new Event(TOUR_START_EVENT));
  }

  return (
    <button
      type="button"
      onClick={start}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      ❔ Como criar um torneio
    </button>
  );
}
