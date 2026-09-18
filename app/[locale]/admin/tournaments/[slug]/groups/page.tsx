'use client';

import { use, Suspense } from 'react';
import { useTournament } from '@/lib/hooks/use-tournament';
import { ClassificationSetup } from '@/components/admin/classification-setup';
import { PageSpinner } from '@/components/ui/spinner';
import { CreatedModal } from './created-modal';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Aba "Emparceiramento" — separada de Editar desde que a tela de criação
 * deixou de perguntar isso na hora (app/admin/tournaments/new só decide
 * Classificação). Reaproveita esta rota, que antes só redirecionava pra
 * /edit (Emparceiramento morava embutido lá).
 */
export default function PairingPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p className="text-red-500">Torneio não encontrado.</p>;

  return (
    <div className="max-w-2xl">
      {/* useSearchParams exige Suspense (Next bailaria a página inteira pra
          client-side render sem isso) — isolado em componente próprio pra
          não arrastar o resto da página pra dentro do boundary. */}
      <Suspense fallback={null}>
        <CreatedModal />
      </Suspense>
      <ClassificationSetup
        tournamentId={tournament.id}
        mode={tournament.mode}
        defaultRounds={tournament.rounds_count}
        currentMode={tournament.pairing_mode}
        currentSplit={tournament.pairing_split ?? null}
        initialDimensions={tournament.classification_dimensions ?? []}
        initialHasAbsolute={tournament.has_absolute_classification ?? true}
        showClassification={false}
      />
    </div>
  );
}
