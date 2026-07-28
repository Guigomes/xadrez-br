'use client';

import { useEffect } from 'react';
import { TOUR_STEPS } from '@/lib/tour/steps';
import { writeProgress, shouldAutoStart, TOUR_START_EVENT } from '@/lib/tour/state';

/**
 * Dispara o tour sozinho para quem nunca criou um torneio. Sem botão próprio
 * — o organizador que já sabe o que faz não deve ver nada aqui; quem quiser
 * rever encontra "Dicas de como criar um torneio" na tela de criar torneio
 * e dentro de um torneio já existente (tour-trigger-button.tsx,
 * tour-resume-link.tsx).
 *
 * O arranque grava o progresso ANTES de disparar o evento de propósito. Efeitos
 * do React rodam de baixo para cima — este componente (filho, dentro da página)
 * monta antes do <TournamentTour /> (no layout), então um evento disparado no
 * mount não teria ouvinte. Gravando o progresso, o tour encontra o estado
 * pendente quando o efeito dele finalmente roda.
 */
export function TourLauncher({ firstTime }: { firstTime: boolean }) {
  useEffect(() => {
    if (shouldAutoStart(firstTime)) {
      writeProgress(TOUR_STEPS[0].id);
      window.dispatchEvent(new Event(TOUR_START_EVENT));
    }
  }, [firstTime]);

  return null;
}
