'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/spinner';
import { useGamePgn } from '@/lib/hooks/use-player-history';
import { useUser } from '@/lib/hooks/use-auth';

// chess.js só entra no bundle quando alguém abre uma partida.
const PgnBoard = dynamic(() => import('./pgn-board').then((m) => m.PgnBoard), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-16">
      <Spinner className="h-8 w-8" />
    </div>
  ),
});

export interface ViewableGame {
  source: 'live' | 'history';
  /** id da mesa (ao vivo) ou da partida do arquivo */
  gameId: string;
  whiteName: string;
  blackName: string;
  /** texto do resultado, ex.: "1 - 0" */
  resultText: string;
  round?: number | null;
  tournamentName?: string | null;
}

export const RESULT_TEXT: Record<string, string> = {
  '1-0': '1 - 0',
  '0-1': '0 - 1',
  '1/2-1/2': '½ - ½',
  forfeit_black: '1 - 0 (W.O.)',
  forfeit_white: '0 - 1 (W.O.)',
  double_forfeit: 'W.O. duplo',
};

// Botão "ver lances" que abre o tabuleiro navegável de uma partida com PGN.
// `orientation`: lado que fica embaixo (o do jogador da página, quando há um).
// Os lances só são buscados ao abrir e só quem está logado consegue lê-los: para quem não
// entrou, o botão abre um convite para entrar com o Google, que volta para esta mesma página.
export function GameViewerButton({
  game,
  orientation = 'white',
  className,
}: {
  game: ViewableGame;
  orientation?: 'white' | 'black';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { user, loading: loadingUser } = useUser();
  const needsLogin = !loadingUser && !user;
  const { data: pgn, isLoading, isError } = useGamePgn(game.source, game.gameId, open && !needsLogin);
  // Volta exatamente para onde a pessoa estava (rodada, filtros) depois de entrar.
  const loginHref = typeof window === 'undefined'
    ? '/login'
    : `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ?? 'py-1 text-xs font-medium text-brand-700 dark:text-brand-300 underline underline-offset-2'
        }
      >
        ♟ ver lances
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Partida ${game.whiteName} contra ${game.blackName}`}
        >
          <div
            className="card w-full max-w-lg p-4 sm:p-6 border-t-4 border-t-brand-500 shadow-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 break-words">
                  ♔ {game.whiteName} <span className="text-gray-400">x</span> ♚ {game.blackName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                  {[game.resultText, game.round ? `Rodada ${game.round}` : null, game.tournamentName].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 py-1 text-sm font-medium text-brand-700 dark:text-brand-300 underline underline-offset-2"
              >
                fechar
              </button>
            </div>
            <div className="mt-4">
              {needsLogin ? (
                <div className="space-y-3 py-2 text-center">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Os lances das partidas ficam disponíveis para quem entra com a conta Google. É grátis e
                    leva um clique.
                  </p>
                  <a
                    href={loginHref}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
                  >
                    Entrar com Google para ver os lances
                  </a>
                </div>
              ) : isLoading ? (
                <div className="flex justify-center py-16">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : isError || !pgn ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Não foi possível carregar os lances desta partida. Entre na sua conta e tente de novo.
                </p>
              ) : (
                <>
                  <PgnBoard pgn={pgn} orientation={orientation} />
                  <CopyPgnButton pgn={pgn} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Copia o PGN cru da partida (o mesmo que alimenta o tabuleiro) para colar no Lichess,
// ChessBase etc. Fallback com textarea para navegador sem a Clipboard API (http, WebView antiga).
function CopyPgnButton({ pgn }: { pgn: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'erro'>('idle');

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pgn);
      } else {
        const ta = document.createElement('textarea');
        ta.value = pgn;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('copy');
      }
      setState('ok');
    } catch {
      setState('erro');
    }
    setTimeout(() => setState('idle'), 2500);
  }

  return (
    <div className="mt-3 flex justify-center">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {state === 'ok' ? '✓ PGN copiado' : state === 'erro' ? 'Não foi possível copiar' : '📋 Copiar PGN'}
      </button>
    </div>
  );
}
