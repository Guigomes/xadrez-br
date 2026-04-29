import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Estatísticas' };

export const revalidate = 300; // revalidate every 5 minutes

export default async function StatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { count: totalTournaments },
    { count: totalPlayers },
    { count: totalFollows },
    { count: totalSubscriptions },
    { data: topFollowed },
    { data: myTournaments },
  ] = await Promise.all([
    supabase.from('tournaments').select('*', { count: 'exact', head: true }),
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('player_follows').select('*', { count: 'exact', head: true }),
    supabase.from('push_subscriptions').select('*', { count: 'exact', head: true }),

    // Most followed players
    supabase
      .from('player_follows')
      .select('player_id, players(full_name)')
      .limit(200),

    // My tournaments with participant and follower counts
    supabase
      .from('tournaments')
      .select(`
        id, name, slug, status, start_date,
        tournament_players(count),
        player_follows(count)
      `)
      .eq('created_by', user.id)
      .order('start_date', { ascending: false })
      .limit(20),
  ]);

  // Aggregate top followed players
  const followCounts = new Map<string, { name: string; count: number }>();
  (topFollowed ?? []).forEach((f) => {
    const name = (f as any).players?.full_name ?? '?';
    const prev = followCounts.get(f.player_id) ?? { name, count: 0 };
    followCounts.set(f.player_id, { name, count: prev.count + 1 });
  });
  const topPlayers = [...followCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const statusLabel: Record<string, string> = {
    registration: 'Inscrições',
    ongoing: 'Em andamento',
    finished: 'Encerrado',
    cancelled: 'Cancelado',
  };
  const statusColor: Record<string, string> = {
    registration: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    ongoing: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    finished: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Estatísticas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Dados da plataforma</p>
        </div>
        <a
          href="https://vercel.com/guigomesti-3700s-projects/chess-viewer/analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-black dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-black hover:opacity-80 transition-opacity"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 19.5h20L12 2z" />
          </svg>
          Ver tráfego no Vercel
        </a>
      </div>

      {/* Global counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Torneios', value: totalTournaments ?? 0, icon: '🏆' },
          { label: 'Jogadores', value: totalPlayers ?? 0, icon: '♟️' },
          { label: 'Seguidores', value: totalFollows ?? 0, icon: '⭐' },
          { label: 'Notificações ativas', value: totalSubscriptions ?? 0, icon: '🔔' },
        ].map((stat) => (
          <div key={stat.label} className="card p-4 text-center">
            <p className="text-2xl mb-1">{stat.icon}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* My tournaments */}
      {(myTournaments?.length ?? 0) > 0 && (
        <div className="card">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Meus torneios</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {myTournaments!.map((t) => {
              const participants = (t.tournament_players as any)?.[0]?.count ?? 0;
              const follows = (t.player_follows as any)?.[0]?.count ?? 0;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/tournaments/${t.slug}`}
                      className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 truncate block"
                    >
                      {t.name}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(t.start_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    <span title="Participantes">♟️ {participants}</span>
                    <span title="Seguidores">⭐ {follows}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[t.status]}`}>
                      {statusLabel[t.status]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top followed players */}
      {topPlayers.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Jogadores mais acompanhados</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {topPlayers.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm font-bold text-gray-400 w-5 text-center shrink-0">{i + 1}</span>
                <p className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                <span className="text-sm text-gray-500 dark:text-gray-400">⭐ {p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vercel Analytics note */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">📈 Dados de tráfego</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Pageviews, visitantes únicos, países e dispositivos ficam no painel do Vercel Analytics.
          Os dados começam a aparecer após as primeiras visitas.
        </p>
        <a
          href="https://vercel.com/guigomesti-3700s-projects/chess-viewer/analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
        >
          Abrir painel de tráfego →
        </a>
      </div>
    </div>
  );
}
