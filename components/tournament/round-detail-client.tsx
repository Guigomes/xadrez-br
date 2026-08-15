'use client';

import { useState } from 'react';
import { useRoundPairings } from '@/lib/hooks/use-tournament';
import { useFollowedInTournament } from '@/lib/hooks/use-auth';
import { PairingsList } from '@/components/tournament/pairings-list';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { matchesPlayerSearch } from '@/lib/utils/text';

interface Props {
  roundId: string;
  tournamentId: string;
  tournamentSlug: string;
  isOngoing: boolean;
}

export function RoundDetailClient({ roundId, tournamentId, tournamentSlug, isOngoing }: Props) {
  const { data: pairings, isLoading } = useRoundPairings(roundId);
  const { data: followed } = useFollowedInTournament(tournamentId);
  const [query, setQuery] = useState('');

  if (isLoading) return <PageSpinner />;

  if (!pairings?.length) {
    return (
      <EmptyState
        icon="📋"
        title="Emparceiramentos não publicados"
        description="Os emparceiramentos desta rodada ainda não foram gerados."
      />
    );
  }

  const filteredPairings = pairings.filter(
    (p) => matchesPlayerSearch(p.white_name, query) || matchesPlayerSearch(p.black_name, query)
  );

  return (
    <div>
      {isOngoing && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Atualizando automaticamente a cada 1 minuto
        </p>
      )}
      <SearchField value={query} onChange={setQuery} className="mb-3 sm:max-w-xs" />
      {filteredPairings.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhum jogador encontrado com esse nome.
        </p>
      ) : (
        <PairingsList pairings={filteredPairings} tournamentSlug={tournamentSlug} followedTpIds={followed?.tpIds} />
      )}
    </div>
  );
}
