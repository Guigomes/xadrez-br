'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { resultLabel, resultBadgeColor, formatScore } from '@/lib/utils/chess';
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
              <PlayerLink tpId={pairing.white_tp_id} name={pairing.white_name} rating={pairing.white_rating} score={pairing.white_score} tournamentSlug={tournamentSlug} color="white" followed={!!followedWhite} />
            </div>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">BYE</Badge>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <PlayerLink tpId={pairing.white_tp_id} name={pairing.white_name} rating={pairing.white_rating} score={pairing.white_score} tournamentSlug={tournamentSlug} color="white" followed={!!followedWhite} />

            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1.5 text-xs font-mono text-gray-500 dark:text-gray-400">
                <span>{pairing.white_points !== null ? formatScore(pairing.white_points) : '?'}</span>
                <span>–</span>
                <span>{pairing.black_points !== null ? formatScore(pairing.black_points) : '?'}</span>
              </div>
              {pairing.result !== '*' && (
                <span className="text-xs text-gray-400 dark:text-gray-500">{pairing.result}</span>
              )}
            </div>

            <PlayerLink tpId={pairing.black_tp_id} name={pairing.black_name} rating={pairing.black_rating} score={pairing.black_score} tournamentSlug={tournamentSlug} color="black" alignRight followed={!!followedBlack} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
      {followed.map((p) => <PairingRow key={p.pairing_id} pairing={p} highlighted />)}
      {hasFollowed && followed.length > 0 && rest.length > 0 && (
        <div className="h-1" />
      )}
      {rest.map((p) => <PairingRow key={p.pairing_id} pairing={p} />)}
    </div>
  );
}

function PlayerLink({
  tpId, name, rating, score, tournamentSlug, color, alignRight, followed,
}: {
  tpId: string | null; name: string; rating: number | null;
  score: number | null; tournamentSlug: string;
  color: 'white' | 'black'; alignRight?: boolean; followed?: boolean;
}) {
  const content = (
    <>
      <div className={`flex items-center gap-1.5 ${alignRight ? 'justify-end' : ''}`}>
        {followed && !alignRight && <span className="text-brand-500 text-xs">★</span>}
        <span className={`h-3 w-3 rounded-full border ${color === 'white' ? 'bg-white border-gray-400' : 'bg-gray-800 border-gray-600'}`} />
        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight">{name}</span>
        {followed && alignRight && <span className="text-brand-500 text-xs">★</span>}
      </div>
      <p className={`text-xs text-gray-400 mt-0.5 ${alignRight ? 'text-right' : ''}`}>
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
