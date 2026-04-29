import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ParticipantsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  const { data: players } = await supabase
    .from('tournament_players')
    .select(`
      id, initial_ranking, current_score, current_rank, status,
      player:players(id, full_name, rating_std, state, city, federation),
      category:tournament_categories(name)
    `)
    .eq('tournament_id', tournament.id)
    .order('initial_ranking', { ascending: true, nullsFirst: false });

  if (!players?.length) {
    return <EmptyState icon="👥" title="Nenhum participante cadastrado" description="Os participantes serão listados assim que inscritos." />;
  }

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {players.length} participante{players.length !== 1 ? 's' : ''} inscrito{players.length !== 1 ? 's' : ''}
      </p>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">#</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Jogador</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Categoria</th>
              <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Rating</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Escola/Município</th>
            </tr>
          </thead>
          <tbody>
            {players.map((tp) => (
              <tr key={tp.id} className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="py-3 px-3 text-gray-400 dark:text-gray-500 tabular-nums">{tp.initial_ranking ?? '–'}</td>
                <td className="py-3 px-3">
                  <Link
                    href={`/tournaments/${slug}/players/${tp.id}`}
                    className="font-medium text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {(tp.player as any)?.full_name}
                  </Link>
                  {tp.status === 'withdrawn' && (
                    <Badge className="ml-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Retirado</Badge>
                  )}
                </td>
                <td className="py-3 px-3">
                  {(tp.category as any)?.name ? (
                    <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 text-xs">
                      {(tp.category as any).name}
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800/60">
        {players.map((tp, i) => (
          <Link
            key={tp.id}
            href={`/tournaments/${slug}/players/${tp.id}`}
            className="flex items-center gap-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
          >
            <span className="text-sm text-gray-400 dark:text-gray-500 w-6 text-center shrink-0">
              {tp.initial_ranking ?? i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{(tp.player as any)?.full_name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {(tp.category as any)?.name ? `${(tp.category as any).name} · ` : ''}
                {(tp.player as any)?.city || (tp.player as any)?.state || ''}
                {(tp.player as any)?.rating_std ? ` · ${(tp.player as any).rating_std}` : ''}
              </p>
            </div>
            <svg className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
