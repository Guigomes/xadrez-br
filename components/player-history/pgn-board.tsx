'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
type MatchColor = 'white' | 'black';

const PIECE_UNICODE: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

type Ply = {
  fen: string;
  san: string | null;
  from: string | null;
  to: string | null;
};

// Converte a parte de posição do FEN em matriz [rank8..rank1][fileA..fileH].
function fenToBoard(fen: string): (string | null)[][] {
  const placement = fen.split(' ')[0];
  return placement.split('/').map((row) => {
    const cells: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        cells.push(...Array(Number(ch)).fill(null));
      } else {
        cells.push(ch);
      }
    }
    return cells;
  });
}

function parsePgn(pgn: string): { plies: Ply[]; ok: boolean } {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const verbose = game.history({ verbose: true });
    if (!verbose.length) return { plies: [{ fen: game.fen(), san: null, from: null, to: null }], ok: true };
    const plies: Ply[] = [{ fen: verbose[0].before, san: null, from: null, to: null }];
    for (const m of verbose) {
      plies.push({ fen: m.after, san: m.san, from: m.from, to: m.to });
    }
    return { plies, ok: true };
  } catch {
    return { plies: [], ok: false };
  }
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function PgnBoard({ pgn, orientation = 'white' }: { pgn: string; orientation?: MatchColor }) {
  const { plies, ok } = useMemo(() => parsePgn(pgn), [pgn]);
  const [index, setIndex] = useState(0);

  const last = plies.length - 1;
  const go = useCallback(
    (next: number) => setIndex(Math.min(Math.max(next, 0), Math.max(last, 0))),
    [last]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setIndex((i) => Math.min(i + 1, last)); }
      else if (e.key === 'Home') { e.preventDefault(); setIndex(0); }
      else if (e.key === 'End') { e.preventDefault(); setIndex(last); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  if (!ok || !plies.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Não foi possível interpretar este PGN para exibir no tabuleiro.
      </p>
    );
  }

  const current = plies[index];
  const board = fenToBoard(current.fen);
  const flipped = orientation === 'black';

  const ranksOrder = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const filesOrder = flipped ? [...FILES].reverse() : FILES;

  // Rótulo do lance atual (ex: "12. Nf3" ou "12... Nf6").
  const moveLabel = (() => {
    if (index === 0) return 'Posição inicial';
    const moveNumber = Math.ceil(index / 2);
    const isWhiteMove = index % 2 === 1;
    return `${moveNumber}${isWhiteMove ? '.' : '...'} ${current.san ?? ''}`;
  })();

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="grid grid-cols-8 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 shadow-sm">
        {ranksOrder.map((rank) =>
          filesOrder.map((file) => {
            const rankRow = 8 - rank; // índice em board (0 = rank8)
            const fileCol = file.charCodeAt(0) - 97;
            const piece = board[rankRow][fileCol];
            const square = `${file}${rank}`;
            const isLight = (rank + fileCol) % 2 === 1;
            const isMoveSquare = current.from === square || current.to === square;

            return (
              <div
                key={square}
                className={[
                  'relative aspect-square flex items-center justify-center select-none',
                  isLight ? 'bg-[#eadfce] dark:bg-[#b9a98f]' : 'bg-[#9a7b5a] dark:bg-[#6d5540]',
                ].join(' ')}
              >
                {isMoveSquare && <div className="absolute inset-0 bg-brand-500/35" />}
                {piece && (
                  <span
                    className={[
                      'relative leading-none text-3xl sm:text-4xl',
                      piece === piece.toUpperCase()
                        ? 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]'
                        : 'text-gray-900 [text-shadow:0_1px_1px_rgba(255,255,255,0.3)]',
                    ].join(' ')}
                  >
                    {PIECE_UNICODE[piece]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-center text-sm font-medium text-gray-700 dark:text-gray-300 mt-3 h-5">
        {moveLabel}
        <span className="text-gray-400 dark:text-gray-500 font-normal"> · {index}/{last}</span>
      </p>

      <div className="mt-2 grid grid-cols-4 gap-2">
        <ControlButton label="Início" disabled={index === 0} onClick={() => go(0)}>⏮</ControlButton>
        <ControlButton label="Anterior" disabled={index === 0} onClick={() => go(index - 1)}>◀</ControlButton>
        <ControlButton label="Próximo" disabled={index === last} onClick={() => go(index + 1)}>▶</ControlButton>
        <ControlButton label="Fim" disabled={index === last} onClick={() => go(last)}>⏭</ControlButton>
      </div>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
        Use as setas ← → do teclado para navegar
      </p>
    </div>
  );
}

function ControlButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-10 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  );
}
