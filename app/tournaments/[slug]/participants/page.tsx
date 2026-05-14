import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ group?: string }>;
}

export default async function ParticipantsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { group: selectedGroupId } = await searchParams;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  // Fetch pairing groups for this tournament (sorted by sort_order)
  const { data: pairingGroups } = await supabase
    .from('pairing_groups')
    .select('id, name')
    .eq('tournament_id', tournament.id)
    .order('sort_order', { ascending: true });

  const groups = pairingGroups ?? [];
  const hasGroups = groups.length > 1;

  // Build the players query — filter by pairing_group_id directly
  let query = supabase
    .from('tournament_players')
    .select(`
      id, initial_ranking, current_score, current_rank, status,
      player:players(id, full_name, rating_std, state, city, federation),
      category:tournament_categories(id, name, pairing_group_id)
    `)
    .eq('tournament_id', tournament.id)
    .order('initial_ranking', { ascending: true, nullsFirst: false });

  if (hasGroups && selectedGroupId) {
    query = query.eq('pairing_group_id', selectedGroupId);
  }

  const { data: players } = await query;

  const base = `/tournaments/${slug}/participants`;

  if (!players?.length && !hasGroups) {
    return (
      <EmptyState
        icon="👥"
        title="Nenhum participante cadastrado"
        description="Os participantes serão listados assim que inscritos."
      />
    );
  }

  const activeGroup = hasGroups && selectedGroupId
    ? groups.find((g) => g.id === selectedGroupId)
    : null;

  return (
    <div>
      {/* Pairing group filter tabs */}
      {hasGroups && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          <Link
            href={base}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              !selectedGroupId
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
            )}
          >
            Todos
          </Link>
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`${base}?group=${g.id}`}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                selectedGroupId === g.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
              )}
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {!players?.length ? (
        <EmptyState
          icon="👥"
          title="Nenhum participante neste grupo"
          description="Nenhum jogador foi inscrito neste grupo ainda."
        />
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {activeGroup ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-300">{activeGroup.name}</span>
                {' — '}
              </>
            ) : null}
            {players.length} participante{players.length !== 1 ? 's' : ''} inscrito{players.length !== 1 ? 's' : ''}
          </p>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">#</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Jogador</th>
                  {!activeGroup && hasGroups && (
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Grupo</th>
                  )}
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Categoria</th>
                  <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Rating</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Escola/Município</th>
                </tr>
              </thead>
              <tbody>
                {players.map((tp) => {
                  const cat = tp.category as any;
                  // Find the group name for this player's category
                  const playerGroup = hasGroups && !activeGroup && cat?.pairing_group_id
                    ? groups.find((g) => g.id === cat.pairing_group_id)
                    : null;

                  return (
                    <tr
                      key={tp.id}
                      className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 px-3 text-gray-400 dark:text-gray-500 tabular-nums">
                        {tp.initial_ranking ?? '–'}
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          href={`/tournaments/${slug}/players/${tp.id}`}
                          className="font-medium text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        >
                          {(tp.player as any)?.full_name}
                        </Link>
                        {tp.status === 'withdrawn' && (
                          <Badge className="ml-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            Retirado
                          </Badge>
                        )}
                      </td>
                      {!activeGroup && hasGroups && (
                        <td className="py-3 px-3">
                          {playerGroup ? (
                            <Link
                              href={`${base}?group=${playerGroup.id}`}
                              className="text-xs text-brand-600 hover:underline dark:text-brand-400"
                            >
                              {playerGroup.name}
                            </Link>
                          ) : '–'}
                        </td>
                      )}
                      <td className="py-3 px-3">
                        {cat?.name ? (
                          <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 text-xs">
                            {cat.name}
                          </Badge>
                        ) : '–'}
                      </td>
                      <td className="py-3 px-3 text-center tabular-nums text-gray-700 dark:text-gray-300">
                        {(tp.player as any)?.rating_std ?? '–'}
                      </td>
                      <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                        {(tp.player as any)?.city || (tp.player as any)?.state || '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800/60">
            {players.map((tp, i) => {
              const cat = tp.category as any;
              const playerGroup = hasGroups && !activeGroup && cat?.pairing_group_id
                ? groups.find((g) => g.id === cat.pairing_group_id)
                : null;

              return (
                <Link
                  key={tp.id}
                  href={`/tournaments/${slug}/players/${tp.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <span className="text-sm text-gray-400 dark:text-gray-500 w-6 text-center shrink-0">
                    {tp.initial_ranking ?? i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {(tp.player as any)?.full_name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {playerGroup ? `${playerGroup.name} · ` : ''}
                      {cat?.name ? `${cat.name} · ` : ''}
                      {(tp.player as any)?.city || (tp.player as any)?.state || ''}
                      {(tp.player as any)?.rating_std ? ` · ${(tp.player as any).rating_std}` : ''}
                    </p>
                  </div>
                  <svg
                    className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
