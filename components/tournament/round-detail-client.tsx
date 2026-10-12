'use client';

import { useState } from 'react';
import { useRoundPairings } from '@/lib/hooks/use-tournament';
import { useFollowedInTournament } from '@/lib/hooks/use-auth';
import { useLivePgnIds } from '@/lib/hooks/use-player-history';
import { PairingsList } from '@/components/tournament/pairings-list';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Switch } from '@/components/ui/switch';
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
  const [onlyPgn, setOnlyPgn] = useState(false);
  const [onlyOngoing, setOnlyOngoing] = useState(false);
  // Quais mesas têm lances: público (só o id). O lance em si pede login — ver GameViewerButton.
  const { data: pgnIds } = useLivePgnIds((pairings ?? []).filter((p) => !p.is_bye).map((p) => p.pairing_id), true);

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

  // Mesa ainda sendo jogada: sem resultado ('*') e não é bye. O filtro só aparece com a rodada
  // em andamento e alguma mesa ainda aberta — no fim da rodada, quando restam poucas, é o que
  // o público quer ver sem rolar a lista inteira.
  const isOpen = (p: (typeof pairings)[number]) => !p.is_bye && p.result === '*';
  const openCount = pairings.filter(isOpen).length;
  const showOngoingFilter = isOngoing && openCount > 0;

  const filteredPairings = pairings.filter(
    (p) => (matchesPlayerSearch(p.white_name, query) || matchesPlayerSearch(p.black_name, query))
      && (!onlyPgn || pgnIds?.has(p.pairing_id))
      && (!onlyOngoing || !showOngoingFilter || isOpen(p))
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
      {(showOngoingFilter || !!pgnIds?.size) && (
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
          {showOngoingFilter && (
            <Switch
              checked={onlyOngoing}
              onChange={setOnlyOngoing}
              label={<>Só em andamento <span className="text-gray-400 dark:text-gray-500">({openCount})</span></>}
            />
          )}
          {!!pgnIds?.size && (
            <Switch
              checked={onlyPgn}
              onChange={setOnlyPgn}
              label={<>Só com lances <span className="text-gray-400 dark:text-gray-500">({pgnIds.size})</span></>}
            />
          )}
        </div>
      )}
      {filteredPairings.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {query ? 'Nenhum jogador encontrado com esse nome.' : 'Nenhuma partida com esse filtro.'}
        </p>
      ) : (
        <PairingsList pairings={filteredPairings} tournamentSlug={tournamentSlug} followedTpIds={followed?.tpIds} pgnIds={pgnIds} />
      )}
    </div>
  );
}
