'use client';

import { openWhatsApp } from '@/lib/utils/whatsapp';

/**
 * Botão "Enviar no WhatsApp" — monta o texto no clique (getText) e abre o
 * WhatsApp com ele. getText é função, não string, pra o texto refletir o
 * estado atual da tela (grupo/faixa selecionados, resultado mais recente) no
 * momento do clique, não no da renderização.
 *
 * Visual alinhado aos botões-irmãos de exportação ("Imprimir…", "Ver como o
 * público vê") — mesma pílula com borda.
 */
export function WhatsAppButton({ getText, label = 'Enviar no WhatsApp' }: { getText: () => string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => openWhatsApp(getText())}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-9 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
    >
      💬 {label}
    </button>
  );
}
