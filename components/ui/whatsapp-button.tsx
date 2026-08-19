'use client';

import { openWhatsApp } from '@/lib/utils/whatsapp';

/**
 * Botão "Enviar no WhatsApp" — só o ícone, sem texto: o organizador pediu
 * porque o símbolo já é reconhecido por si só, sem precisar de rótulo do
 * lado. `label` continua existindo, mas vira aria-label/title (leitor de
 * tela e tooltip no hover), não texto visível.
 *
 * getText é função, não string, pra o texto refletir o estado atual da tela
 * (grupo/faixa selecionados, resultado mais recente) no momento do clique,
 * não no da renderização.
 */
export function WhatsAppButton({ getText, label = 'Enviar no WhatsApp' }: { getText: () => string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => openWhatsApp(getText())}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#25D366]" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.92 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.83 14.15c-.25.7-1.23 1.29-1.99 1.45-.53.11-1.22.2-3.55-.76-2.98-1.23-4.9-4.26-5.05-4.46-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.59-.37.78-.37.2 0 .39 0 .56.01.18.01.42-.07.66.5.25.6.84 2.05.91 2.2.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.12.65-.07.18-.2.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.72.81 2.02.96.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
      </svg>
    </button>
  );
}
