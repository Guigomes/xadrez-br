'use client';

import { useEffect, useRef } from 'react';
import { localizedTitle } from '@/lib/utils/player-title';
import { playerDisplayName } from '@/lib/utils/player-name';
import { formatScore, winnerSide } from '@/lib/utils/chess';
import { WhitePawn, BlackPawn } from './piece-icons';
import { PlayerScoreSummary } from './player-score-summary';
import type { RoundPairingRow } from '@/types/database';
import { animateTvVictory, newTvWinner, type TvResultSnapshot } from '@/lib/tournament/tv-victory';

export function TvPairingCard({ pairing, locale }: { pairing: RoundPairingRow; locale: string }) {
  const card = useRef<HTMLElement>(null);
  const previous = useRef<TvResultSnapshot>(pairing);
  const { pairing_id, white_tp_id, black_tp_id, result, is_bye } = pairing;
  useEffect(() => {
    const next = { pairing_id, white_tp_id, black_tp_id, result, is_bye };
    const winner = newTvWinner(previous.current, next);
    previous.current = next;
    if (!winner || !card.current) return;
    return animateTvVictory(card.current, winner, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  }, [pairing_id, white_tp_id, black_tp_id, result, is_bye]);

  const bye = pairing.is_bye;
  const pending = pairing.result === '*';
  const wo = ['forfeit_white', 'forfeit_black', 'double_forfeit'].includes(pairing.result);
  const points = (value: number | null) => value === 0.5 ? '½' : value === null ? '?' : formatScore(value);
  return (
    <article ref={card} className="relative isolate grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-2xl bg-white p-3 text-gray-900 shadow-md sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4 sm:p-4">
      <div aria-hidden="true" data-tv-victory-glow className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-100 via-amber-50 to-transparent opacity-0 ring-2 ring-inset ring-amber-300" />
      <div className="relative rounded-xl bg-brand-50 py-1 text-center">
        <span className="text-xs font-bold uppercase tracking-wide text-brand-600">Mesa</span>
        <p className="text-4xl font-black leading-none text-brand-700 sm:text-5xl">{pairing.board_number ?? '—'}</p>
      </div>
      <div className={`relative grid min-w-0 items-center gap-3 ${bye ? '' : 'sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'}`}>
        <PlayerName side="white" title={localizedTitle(pairing.white_title ?? null, locale)} name={playerDisplayName(pairing.white_name, pairing.white_fide_name, locale)} rating={pairing.white_rating} score={pairing.white_score} winner={!bye && winnerSide(pairing.result, 'white') === 'winner'} />
        {bye ? (
          <p className="text-base font-semibold text-gray-500">
            {pairing.result === 'not_paired' ? 'Não emparceirado' : 'Bye'}
            {pairing.white_points !== null && ` · ${points(pairing.white_points)} ${pairing.white_points === 1 || pairing.white_points === 0.5 ? 'ponto' : 'pontos'}`}
          </p>
        ) : (
          <>
            <div className="text-center" aria-label="Resultado">
              <p className={`whitespace-nowrap text-2xl font-black ${pending ? 'text-brand-300' : 'text-brand-800'}`}>
                {pending ? '×' : `${points(pairing.white_points)} – ${points(pairing.black_points)}`}
              </p>
              <p className="text-xs font-semibold text-gray-500">{pending ? 'Em andamento' : wo ? 'W.O.' : 'Finalizada'}</p>
            </div>
            <PlayerName side="black" title={localizedTitle(pairing.black_title ?? null, locale)} name={playerDisplayName(pairing.black_name, pairing.black_fide_name, locale)} rating={pairing.black_rating} score={pairing.black_score} winner={winnerSide(pairing.result, 'black') === 'winner'} />
          </>
        )}
      </div>
    </article>
  );
}

function PlayerName({ side, title, name, rating, score, winner }: {
  side: 'white' | 'black'; title: string | null; name: string; rating: number | null; score: number | null; winner: boolean;
}) {
  const Pawn = side === 'white' ? WhitePawn : BlackPawn;
  return (
    <div data-tv-player={side} className={`flex min-w-0 items-start gap-2 ${winner ? 'text-brand-800' : ''}`}>
      <span className="shrink-0" aria-label={side === 'white' ? 'Brancas' : 'Pretas'}><Pawn className="h-10 w-8 sm:h-12 sm:w-10" /></span>
      <div className="min-w-0">
        <p data-tv-name className="break-words text-xl font-bold sm:text-3xl">
          {title && <span className="mr-2 text-base font-semibold text-amber-600 sm:text-xl">{title}</span>}
          {name || 'Jogador não informado'}
          {winner && <span data-tv-trophy aria-label="Vencedor" className="ml-2 inline-block origin-bottom text-[1.2em] leading-none text-amber-600">🏆</span>}
        </p>
        <PlayerScoreSummary rating={rating} score={score} className="text-sm font-medium text-gray-500 sm:text-base" />
      </div>
    </div>
  );
}
