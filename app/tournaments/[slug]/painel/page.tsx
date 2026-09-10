import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { TvControls } from '@/components/tournament/tv-controls';

export const dynamic = 'force-dynamic';

export default async function TournamentTvPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: tournament } = await admin.from('tournaments')
    .select('id, name, city, state, is_public, status')
    .eq('slug', slug).maybeSingle();
  if (!tournament?.is_public) notFound();

  const { data: rounds } = await admin.from('rounds')
    .select('id, round_number, status, pairing_groups(name)')
    .eq('tournament_id', tournament.id)
    .eq('status', 'ongoing')
    .order('round_number').limit(1);
  const round = rounds?.[0] ?? null;
  const { data: pairings } = round
    ? await admin.rpc('get_round_pairings', { p_round_id: round.id })
    : { data: [] };

  return (
    <main className="fixed inset-0 z-50 overflow-auto bg-gray-950 px-4 py-6 text-white sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand-300">Painel de chamada</p>
          <h1 className="mt-1 text-3xl font-black sm:text-5xl">{tournament.name}</h1>
          <p className="mt-2 text-gray-400">{tournament.city}, {tournament.state}</p>
        </div>
        <TvControls />
      </header>

      {!round ? (
        <div className="grid min-h-96 place-items-center rounded-3xl border border-white/10 bg-white/5 text-center">
          <div><p className="text-3xl font-bold">Aguardando a próxima rodada</p><p className="mt-2 text-gray-400">O painel será atualizado automaticamente.</p></div>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-4xl font-black text-brand-300">Rodada {round.round_number}</h2>
            <p className="text-lg text-gray-400">{(round.pairing_groups as unknown as { name: string } | null)?.name}</p>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {(pairings ?? []).map((pairing) => (
              <article key={pairing.pairing_id} className="grid grid-cols-[5rem_1fr_auto_1fr] items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:grid-cols-[7rem_1fr_auto_1fr]">
                <div className="text-center"><span className="text-sm uppercase text-gray-500">Mesa</span><p className="text-4xl font-black text-brand-300">{pairing.board_number ?? '—'}</p></div>
                <PlayerName title={pairing.white_title} name={pairing.white_name} align="right" />
                <span className="text-xl font-black text-gray-500">×</span>
                <PlayerName title={pairing.black_title} name={pairing.black_name} />
              </article>
            ))}
          </div>
        </>
      )}
      <p className="mt-8 text-center text-sm text-gray-500">Acompanhe no celular: /tournaments/{slug}</p>
    </main>
  );
}

function PlayerName({ title, name, align = 'left' }: { title: string | null; name: string; align?: 'left' | 'right' }) {
  return <p className={`min-w-0 truncate text-xl font-bold sm:text-3xl ${align === 'right' ? 'text-right' : ''}`}>{title && <span className="mr-2 text-base text-amber-400 sm:text-xl">{title}</span>}{name}</p>;
}
