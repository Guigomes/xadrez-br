'use client';

import { use } from 'react';
import Link from 'next/link';
import { useTournament, useTournamentPlayers } from '@/lib/hooks/use-tournament';
import { useCategories } from '@/lib/hooks/use-classifications';
import { useGroups } from '@/lib/hooks/use-native-rounds';
import { PageSpinner } from '@/components/ui/spinner';

interface Props {
  params: Promise<{ slug: string }>;
}

const TOURNAMENT_TYPE_LABEL: Record<string, string> = {
  swiss: 'Suíço',
  round_robin: 'Round robin',
};

const DIMENSION_LABEL: Record<string, string> = {
  age: 'idade',
  rating: 'rating',
  sex: 'feminina',
};

function formatDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

/**
 * Visão geral do torneio — pousa aqui logo após "Criar torneio" (em vez de
 * cair direto na aba Editar). Só leitura: revisar o que foi criado antes de
 * decidir se precisa ajustar algo. Sem aba própria (admin-tournament-tabs.tsx
 * não lista essa rota) — alcançada só pelo redirect pós-criação ou por link
 * direto.
 */
export default function TournamentOverviewPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);
  const { data: categories } = useCategories(tournament?.id ?? '');
  const { data: groups } = useGroups(tournament?.id ?? '');
  const { data: players } = useTournamentPlayers(tournament?.id ?? '');

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  const start = formatDate(tournament.start_date);
  const end = formatDate(tournament.end_date);
  const regEnd = formatDate(tournament.registration_end_date);

  const pairingLabel =
    tournament.pairing_mode === 'custom' ? 'Personalizado'
      : tournament.pairing_mode === 'per_category' ? `Por ${tournament.pairing_split === 'rating' ? 'rating' : 'idade'}`
      : 'Único (todos juntos)';

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Informações básicas</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500 dark:text-gray-400">Local</dt>
          <dd className="text-gray-900 dark:text-gray-100">{tournament.city}/{tournament.state}</dd>
          <dt className="text-gray-500 dark:text-gray-400">Início</dt>
          <dd className="text-gray-900 dark:text-gray-100">
            {start}{tournament.start_time ? ` às ${tournament.start_time.slice(0, 5)}` : ''}
          </dd>
          {end && (
            <>
              <dt className="text-gray-500 dark:text-gray-400">Término</dt>
              <dd className="text-gray-900 dark:text-gray-100">{end}</dd>
            </>
          )}
          <dt className="text-gray-500 dark:text-gray-400">Formato</dt>
          <dd className="text-gray-900 dark:text-gray-100">
            {TOURNAMENT_TYPE_LABEL[tournament.tournament_type] ?? tournament.tournament_type}, {tournament.rounds_count} rodadas
          </dd>
          <dt className="text-gray-500 dark:text-gray-400">Ritmo</dt>
          <dd className="text-gray-900 dark:text-gray-100">{tournament.time_control}</dd>
        </dl>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Inscrição</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500 dark:text-gray-400">Valor</dt>
          <dd className="text-gray-900 dark:text-gray-100">{tournament.is_free ? 'Gratuita' : (tournament.registration_fee_text || 'Paga')}</dd>
          {regEnd && (
            <>
              <dt className="text-gray-500 dark:text-gray-400">Encerra em</dt>
              <dd className="text-gray-900 dark:text-gray-100">{regEnd}</dd>
            </>
          )}
          {tournament.require_cbx_id && (
            <>
              <dt className="text-gray-500 dark:text-gray-400">ID CBX</dt>
              <dd className="text-gray-900 dark:text-gray-100">Obrigatório</dd>
            </>
          )}
        </dl>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Classificação e emparceiramento</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500 dark:text-gray-400">Classificação</dt>
          <dd className="text-gray-900 dark:text-gray-100">
            {tournament.classification_dimensions.length > 0
              ? `${categories?.length ?? 0} classificaç${(categories?.length ?? 0) !== 1 ? 'ões' : 'ão'} (${tournament.classification_dimensions.map((d) => DIMENSION_LABEL[d] ?? d).join(', ')})`
              : 'Só Geral'}
          </dd>
          <dt className="text-gray-500 dark:text-gray-400">Emparceiramento</dt>
          <dd className="text-gray-900 dark:text-gray-100">
            {pairingLabel}{groups && groups.length > 0 ? ` — ${groups.length} grupo${groups.length !== 1 ? 's' : ''}` : ''}
          </dd>
          <dt className="text-gray-500 dark:text-gray-400">Participantes</dt>
          <dd className="text-gray-900 dark:text-gray-100">{players?.length ?? 0}</dd>
        </dl>
        {tournament.pairing_mode === 'custom' && (groups?.length ?? 0) === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ Emparceiramento personalizado ainda sem grupo — configure na aba Editar antes de abrir inscrições.
          </p>
        )}
      </div>

      <div>
        <Link
          href={`/admin/tournaments/${slug}/edit`}
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-6 h-12 text-base font-medium text-white hover:bg-brand-700 transition-colors w-full sm:w-auto"
        >
          Editar torneio
        </Link>
      </div>
    </div>
  );
}
