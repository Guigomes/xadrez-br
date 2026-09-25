import Image from 'next/image';

/**
 * Botão flutuante que abre/fecha o widget — separado do painel em si
 * (chat-widget.tsx) pra ficar simples de reposicionar/estilizar sozinho.
 * Mostra o Gambito (mesmo mascote do tour guiado e da home) em vez de um
 * ícone de balão genérico — pedido do usuário pra ele "ser" o suporte.
 */
export function ChatBubble({ open, onClick, pulse = false }: { open: boolean; onClick: () => void; pulse?: boolean }) {
  return (
    <div className="fixed bottom-[max(0.25rem,env(safe-area-inset-bottom))] right-1 z-40 h-10 w-10 sm:bottom-4 sm:right-4 sm:h-14 sm:w-14">
      {/* Halo de atenção enquanto o chat nunca foi aberto — some no 1º clique. */}
      {pulse && !open && (
        <span className="pointer-events-none absolute inset-0 hidden rounded-full bg-brand-500/60 animate-ping sm:block" aria-hidden="true" />
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={open ? 'Fechar chat com o Gambito' : 'Falar com o Gambito'}
        className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-white shadow-lg shadow-brand-900/25 ring-2 ring-white/80 transition-all hover:bg-brand-700 hover:scale-105 active:scale-95 sm:h-14 sm:w-14 sm:shadow-xl dark:bg-brand-500 dark:ring-gray-900 dark:hover:bg-brand-600 after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.45),transparent_55%)]"
      >
        {open ? (
          <svg className="relative z-10 h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <Image
            src="/mascot/gambito-acenando.png"
            alt=""
            width={56}
            height={56}
            className="relative z-10 h-full w-full object-cover object-top"
          />
        )}
      </button>
    </div>
  );
}
