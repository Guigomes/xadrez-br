'use client';

import { use } from 'react';
import Link from 'next/link';
import { usePlayer, usePlayerTournaments } from '@/lib/hooks/use-player';
import { usePlayerFollow } from '@/lib/hooks/use-auth';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/ui/share-button';
import { EmptyState } from '@/components/ui/empty-state';
import { getTournamentStatusColor, getTournamentStatusLabel, formatScore } from '@/lib/utils/chess';
import { formatDate } from '@/lib/utils/date';

interface Props {
  params: Promise<{ id: string }>;
}

export default function PlayerProfilePage({ params }: Props) {
  const { id } = use(params);
  const { data: player, isLoading } = usePlayer(id);
  const { data: tournaments, isLoading: loadingTournaments } = usePlayerTournaments(id);
  const { isFollowing, toggleFollow, user } = usePlayerFollow(id);

  if (isLoading) return <PageSpinner />;
  if (!player) return (
    <div className="container-app py-16">
      <EmptyState icon="🔍" title="Jogador não encontrado" />
    </div>
  );

  return (
    <div className="container-app py-8 max-w-2xl">
      {/* Player card */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{player.full_name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {[player.city, player.state].filter(Boolean).join(', ')}
              {player.birth_year ? ` · Nascido em ${player.birth_year}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <ShareButton title={player.full_name} />
            {user ? (
              <Button
                variant={isFollowing ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => toggleFollow.mutate()}
                loading={toggleFollow.isPending}
              >
                {isFollowing ? '★ Seguindo' : '☆ Seguir'}
              </Button>
            ) : (
              <Link href="/login">
                <Button variant="secondary" size="sm">☆ Seguir</Button>
              </Link>
            )}
          </div>
        </div>

        {/* Ratings */}
        <div className="grid grid-cols-3 gap-3 py-4 border-t border-gray-100 dark:border-gray-800">
          <RatingCell label="Rating Std" value={player.rating_std} />
          <RatingCell label="Rating Rápido" value={player.rating_rpd} />
          <RatingCell label="Rating Blitz" value={player.rating_blz} />
        </div>

        {/* IDs */}
        {(player.fide_id || player.cbx_id) && (
          <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            {player.fide_id && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">FIDE {player.fide_id}</Badge>}
            {player.cbx_id && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">CBX {player.cbx_id}</Badge>}
            {player.federation && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{player.federation}</Badge>}
          </div>
        )}
      </div>

      {/* Tournament history */}
      <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Torneios disputados</h2>
      {loadingTournaments ? (
        <PageSpinner />
      ) : !tournaments?.length ? (
        <EmptyState icon="♟" title="Nenhum torneio registrado" />
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-gray-800/60">
          {tournaments.map((tp) => {
            const t = (tp as any).tournament;
            if (!t) return null;
            return (
              <Link
                key={tp.id}
                href={`/tournaments/${t.slug}/players/${tp.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(t.start_date)} · {t.city}, {t.state}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={getTournamentStatusColor(t.status, t.registration_end_date)}>
                    {getTournamentStatusLabel(t.status, t.registration_end_date)}
                  </Badge>
                  {tp.current_rank && (
                    <span className="text-xs text-gray-500">{tp.current_rank}º · {formatScore(tp.current_score)} pts</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RatingCell({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="text-center">
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value ?? '–'}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
