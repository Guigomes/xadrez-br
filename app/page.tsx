import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TournamentCard } from '@/components/tournament/tournament-card';
import type { TournamentListItem } from '@/types/database';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: ongoing } = await supabase.rpc('search_tournaments', {
    p_status: 'ongoing', p_limit: 3,
  });
  const { data: upcoming } = await supabase.rpc('search_tournaments', {
    p_status: 'registration', p_limit: 3,
  });

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-brand-700 to-brand-900 text-white overflow-hidden">
        {/* Chessboard pattern overlay */}
        <div className="chess-pattern absolute inset-0 pointer-events-none" />
        {/* Decorative chess pieces */}
        <div className="absolute right-0 top-0 bottom-0 hidden lg:flex flex-col justify-center pr-16 gap-2 pointer-events-none select-none" aria-hidden="true">
          <span className="text-[120px] leading-none text-white/10 -rotate-6">♛</span>
          <span className="text-[64px] leading-none text-white/10 pl-12 rotate-3">♞</span>
        </div>
        <div className="container-app py-14 sm:py-20 relative">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium text-brand-100 mb-6">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              Torneios ao vivo agora
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
              Acompanhe torneios de xadrez em tempo real
            </h1>
            <p className="text-brand-100 text-lg mb-8">
              Resultados, classificações e emparceiramentos em tempo real para jogadores, organizadores e público geral.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/tournaments"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
              >
                <span>♟</span> Ver torneios
              </Link>
              <Link
                href="/players"
                className="inline-flex items-center justify-center rounded-xl border border-brand-400 px-6 py-3 font-semibold text-white hover:bg-brand-600/50 transition-colors"
              >
                Buscar jogador
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-y border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="container-app py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { icon: '♟', label: 'Resultados ao vivo', desc: 'Atualização automática' },
              { icon: '♜', label: 'Emparceiramentos',   desc: 'Mesa por rodada' },
              { icon: '♛', label: 'Classificações',     desc: 'Ranking em tempo real' },
              { icon: '♞', label: 'Histórico completo', desc: 'Rodada por rodada' },
            ].map((f) => (
              <div key={f.label} className="flex flex-col items-center text-center gap-1">
                <span className="text-3xl text-brand-600 dark:text-brand-400">{f.icon}</span>
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{f.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container-app py-10 space-y-12">
        {/* Ongoing tournaments */}
        {(ongoing?.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Em andamento</h2>
              </div>
              <Link href="/tournaments?status=ongoing" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
                Ver todos
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(ongoing as TournamentListItem[]).map((t) => (
                <TournamentCard key={t.id} tournament={t} />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming */}
        {(upcoming?.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Inscrições abertas</h2>
              <Link href="/tournaments?status=registration" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
                Ver todos
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(upcoming as TournamentListItem[]).map((t) => (
                <TournamentCard key={t.id} tournament={t} />
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="card p-6 sm:p-8 bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/40 dark:to-gray-900">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Acompanhe jogadores e torneios ♛
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm sm:text-base">
            Consulte mesa, resultado da última partida e posição na classificação com atualização em tempo real.
          </p>
          <Link
            href="/players"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Buscar jogador
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </section>
      </div>
    </div>
  );
}
