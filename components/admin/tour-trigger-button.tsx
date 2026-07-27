'use client';

import { writeProgress, TOUR_START_EVENT } from '@/lib/tour/state';

/**
 * Botão genérico de "(re)começar o tour a partir daqui" — dispara no lugar,
 * sem navegar. Usa o mesmo mecanismo de <TourLauncher> (grava o passo, o
 * evento reexecuta o efeito de <TournamentTour />, montado no layout), só
 * que parametrizado pelo passo inicial em vez de fixo no primeiro do tour
 * inteiro — cada tela que usa isso já está na rota certa.
 */
export function TourTriggerButton({ stepId, label }: { stepId: string; label: string }) {
  function start() {
    writeProgress(stepId);
    window.dispatchEvent(new Event(TOUR_START_EVENT));
  }

  return (
    <button
      type="button"
      onClick={start}
      className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      {label}
    </button>
  );
}
