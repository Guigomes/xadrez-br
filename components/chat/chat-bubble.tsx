import Image from 'next/image';

/**
 * Botão flutuante que abre/fecha o widget — separado do painel em si
 * (chat-widget.tsx) pra ficar simples de reposicionar/estilizar sozinho.
 * Mostra o Gambito (mesmo mascote do tour guiado e da home) em vez de um
 * ícone de balão genérico — pedido do usuário pra ele "ser" o suporte.
 */
export function ChatBubble({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Fechar chat com o Gambito' : 'Falar com o Gambito'}
      className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600"
    >
      {open ? (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <Image
          src="/mascot/gambito-acenando.png"
          alt=""
          width={56}
          height={56}
          className="h-full w-full object-cover object-top"
        />
      )}
    </button>
  );
}
