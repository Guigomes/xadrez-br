'use client';

import { useEffect } from 'react';
import { TOUR_STEPS } from '@/lib/tour/steps';
import { writeProgress, shouldAutoStart, TOUR_START_EVENT, TOUR_ENABLED } from '@/lib/tour/state';

/**
 * Dispara o tour sozinho para quem nunca criou um torneio. Sem botão próprio
 * — o botão visível ao lado de "Novo torneio" é um <TourTriggerButton>
 * separado (app/admin/page.tsx); este componente só cuida do autostart.
 *
 * O arranque grava o progresso ANTES de disparar o evento de propósito. Efeitos
 * do React rodam de baixo para cima — este componente (filho, dentro da página)
 * monta antes do <TournamentTour /> (no layout), então um evento disparado no
 * mount não teria ouvinte. Gravando o progresso, o tour encontra o estado
 * pendente quando o efeito dele finalmente roda.
 */
export function TourLauncher({ firstTime }: { firstTime: boolean }) {
  useEffect(() => {
    if (!TOUR_ENABLED) return;
    if (shouldAutoStart(firstTime)) {
      writeProgress(TOUR_STEPS[0].id);
      window.dispatchEvent(new Event(TOUR_START_EVENT));
    }
  }, [firstTime]);

  return null;
}
