'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatScore, winnerSide } from '@/lib/utils/chess';
import { WhitePawn, BlackPawn } from '@/components/tournament/piece-icons';
import type { RoundPairingRow } from '@/types/database';

interface PairingsListProps {
  pairings: RoundPairingRow[];
  tournamentSlug: string;
  followedTpIds?: Set<string>;
}

export function PairingsList({ pairings, tournamentSlug, followedTpIds }: PairingsListProps) {
  if (pairings.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Emparceiramentos ainda não publicados.
      </p>
    );
  }

  const hasFollowed = !!followedTpIds?.size;
  const followed = hasFollowed ? pairings.filter(
    (p) => (p.white_tp_id && followedTpIds!.has(p.white_tp_id)) || (p.black_tp_id && followedTpIds!.has(p.black_tp_id))
  ) : [];
  const rest = hasFollowed ? pairings.filter(
    (p) => !(p.white_tp_id && followedTpIds!.has(p.white_tp_id)) && !(p.black_tp_id && followedTpIds!.has(p.black_tp_id))
  ) : pairings;

  function PairingRow({ pairing, highlighted }: { pairing: RoundPairingRow; highlighted?: boolean }) {
    const followedWhite = highlighted && !!pairing.white_tp_id && followedTpIds?.has(pairing.white_tp_id);
    const followedBlack = highlighted && !!pairing.black_tp_id && followedTpIds?.has(pairing.black_tp_id);
    const whiteState = winnerSide(pairing.result, 'white');
    const blackState = winnerSide(pairing.result, 'black');
    const hasResult = pairing.result !== '*';

    return (
      <div className={`py-3 px-1 rounded-lg ${highlighted ? 'bg-brand-50 dark:bg-brand-950/20 px-3 -mx-1' : ''}`}>
        {pairing.board_number && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5 font-medium">
            Tabuleiro {pairing.board_number}
          </p>
        )}

        {pairing.is_bye ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <PlayerLink tpId={pairing.white_tp_id} name={pairing.white_name} rating={pairing.white_rating} score={pairing.white_score} tournamentSlug={tournamentSlug} color="white" state="winner" followed={!!followedWhite} />
            </div>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">BYE</Badge>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <PlayerLink tpId={pairing.white_tp_id} name={pairing.white_name} rating={pairing.white_rating} score={pairing.white_score} tournamentSlug={tournamentSlug} color="white" state={whiteState} followed={!!followedWhite} />

            <div className="flex flex-col items-center gap-0.5 min-w-[3rem]">
              {hasResult ? (
                <div className="flex items-center gap-1 text-sm font-bold">
                  <span className={whiteState === 'winner' ? 'text-gray-900 dark:text-gray-100' : whiteState === 'loser' ? 'text-gray-400 dark:text-gray-600' : 'text-gray-600 dark:text-gray-400'}>
                    {pairing.white_points !== null ? formatScore(pairing.white_points) : '?'}
                  </span>
                  <span className="text-gray-400 text-xs font-normal">–</span>
                  <span className={blackState === 'winner' ? 'text-gray-900 dark:text-gray-100' : blackState === 'loser' ? 'text-gray-400 dark:text-gray-600' : 'text-gray-600 dark:text-gray-400'}>
                    {pairing.black_points !== null ? formatScore(pairing.black_points) : '?'}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">×</span>
              )}
            </div>

            <PlayerLink tpId={pairing.black_tp_id} name={pairing.black_name} rating={pairing.black_rating} score={pairing.black_score} tournamentSlug={tournamentSlug} color="black" state={blackState} alignRight followed={!!followedBlack} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
      {followed.map((p) => <PairingRow key={p.pairing_id} pairing={p} highlighted />)}
      {hasFollowed && followed.length > 0 && rest.length > 0 && (
        <div className="py-3 bg-gray-50 dark:bg-gray-900/50">
          <div className="border-t-2 border-dashed border-gray-300 dark:border-gray-700 mx-3" />
        </div>
      )}
      {rest.map((p) => <PairingRow key={p.pairing_id} pairing={p} />)}
    </div>
  );
}

function PlayerLink({
  tpId, name, rating, score, tournamentSlug, color, state, alignRight, followed,
}: {
  tpId: string | null; name: string; rating: number | null;
  score: number | null; tournamentSlug: string;
  color: 'white' | 'black';
  state: 'winner' | 'loser' | 'draw' | 'pending';
  alignRight?: boolean; followed?: boolean;
}) {
  const isWinner = state === 'winner';
  const isLoser  = state === 'loser';

  const nameClass = isWinner
    ? 'font-bold text-gray-900 dark:text-gray-100'
    : isLoser
    ? 'font-medium text-gray-400 dark:text-gray-500'
    : 'font-medium text-gray-900 dark:text-gray-100';

  const content = (
    <>
      <div className={`flex items-center justify-center gap-1.5`}>
        {followed && !alignRight && <span className="text-brand-500 text-xs">★</span>}
        {color === 'white'
          ? <WhitePawn className="h-4 w-3 shrink-0" />
          : <BlackPawn className="h-4 w-3 shrink-0" />
        }
        <span className={`text-xs leading-tight ${nameClass}`}>{name}</span>
        {isWinner && <span className="text-xs">🏆</span>}
        {followed && alignRight && <span className="text-brand-500 text-xs">★</span>}
      </div>
      <p className={`text-xs mt-0.5 text-center ${isLoser ? 'text-gray-400 dark:text-gray-600' : 'text-gray-400'}`}>
        {rating ? `Rating ${rating}` : 'Sem rating'}
        {score !== null && ` · ${formatScore(score)} pts`}
      </p>
    </>
  );

  if (!tpId) return <div>{content}</div>;
  return (
    <Link href={`/tournaments/${tournamentSlug}/players/${tpId}`} className="block hover:opacity-80 transition-opacity">
      {content}
    </Link>
  );
}
