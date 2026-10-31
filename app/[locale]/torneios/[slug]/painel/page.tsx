import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import type { Database, StandingRow } from '@/types/database';
import { siteUrl } from '@/lib/seo';
import { TvControls } from '@/components/tournament/tv-controls';
import { TvPairingCard } from '@/components/tournament/tv-pairing-card';
import { TvDisplay } from '@/components/tournament/tv-display';
import { TvStandings } from '@/components/tournament/tv-standings';

export const dynamic = 'force-dynamic';

export default async function TournamentTvPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  // "Private" tournaments are unlisted, not protected: published tournaments
  // open by direct link, as in migration 032. Drafts remain inaccessible here.
  const publicClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data: tournament, error: tournamentError } = await publicClient.from('tournaments')
    .select('id, name, city, state, is_public, status')
    .eq('slug', slug).maybeSingle();
  if (tournamentError) throw new Error('Não foi possível carregar o torneio do painel.');
  if (!tournament || tournament.status === 'draft') notFound();

  const [roundsResult, groupsResult, standingsResult] = await Promise.all([
    publicClient.from('rounds')
      .select('id, round_number, status, pairing_group_id, pairing_groups(name)')
      .eq('tournament_id', tournament.id)
      .in('status', ['ongoing', 'finished'])
      .order('round_number', { ascending: false }).order('id'),
    publicClient.from('pairing_groups').select('id, name').eq('tournament_id', tournament.id).order('sort_order').order('id'),
    publicClient.rpc('get_tournament_standings', { p_tournament_id: tournament.id }),
  ]);
  if (roundsResult.error) throw new Error('Não foi possível carregar as rodadas do painel.');
  if (groupsResult.error) throw new Error('Não foi possível carregar os grupos do painel.');
  if (standingsResult.error) throw new Error('Não foi possível carregar a classificação do painel.');
  const rounds = roundsResult.data ?? [];
  // Prefer the current round; retain the last published results between rounds.
  const round = rounds.find((item) => item.status === 'ongoing') ?? rounds[0] ?? null;
  const { data: pairings, error: pairingsError } = round
    ? await publicClient.rpc('get_round_pairings', { p_round_id: round.id })
    : { data: [], error: null };
  if (pairingsError) throw new Error('Não foi possível carregar as mesas do painel.');

  // QR no lugar do link: a TV está longe demais para ninguém digitar endereço. SVG gerado aqui
  // no servidor (sem JS nem imagem no navegador), verde-escuro da marca sobre fundo branco.
  const followUrl = `${siteUrl()}/torneios/${slug}`;
  const qrSvg = await QRCode.toString(followUrl, {
    type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#113827', light: '#ffffff' },
  });

  // Torneio com um grupo só (o "Absoluto" de todo nativo) não precisa citar o grupo.
  const groups = groupsResult.data ?? [];
  const selectedGroupId = round?.pairing_group_id ?? groups[0]?.id ?? null;
  const groupName = groups.length > 1
    ? (round?.pairing_groups as unknown as { name: string } | null)?.name ?? groups[0]?.name
    : null;
  // Keep the RPC's published positions/order. Never mix ranks from different groups.
  const standings = ((standingsResult.data ?? []) as StandingRow[])
    .filter((row) => row.pairing_group_id === selectedGroupId);

  return (
    <TvDisplay header={
      <header className="flex flex-wrap items-start justify-between gap-3 sm:gap-5">
        <div className="min-w-0">
          <p className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.2em] text-brand-200">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl leading-none text-brand-700 shadow">♞</span>
            Gambito Torneios · Painel para TV
          </p>
          <h1 className="mt-2 text-2xl font-black leading-tight sm:text-4xl">{tournament.name}</h1>
          <p className="mt-1 text-base text-brand-200">{tournament.city}, {tournament.state}</p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-4 rounded-2xl bg-white p-3 text-brand-900 shadow-lg">
            <div className="h-16 w-16 shrink-0 sm:h-24 sm:w-24 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="max-w-[9rem] text-sm font-bold leading-snug sm:text-base">
              Aponte a câmera e acompanhe pelo celular
            </p>
          </div>
          <TvControls tournamentId={tournament.id} />
        </div>
      </header>
    } rounds={
      !round ? (
        <div className="grid min-h-96 place-items-center rounded-3xl bg-white/10 text-center ring-1 ring-white/15">
          <div>
            <p className="text-5xl">♟</p>
            <p className="mt-3 text-3xl font-bold">Aguardando a próxima rodada</p>
            <p className="mt-2 text-brand-200">O painel será atualizado automaticamente.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 className="rounded-full bg-white px-6 py-2 text-3xl font-black text-brand-800 shadow sm:text-4xl">
              Rodada {round.round_number}
            </h2>
            {groupName && <p className="text-xl font-semibold text-brand-200">{groupName}</p>}
            <p className="text-lg text-brand-200">{tournament.status === 'finished' ? 'Torneio encerrado' : round.status === 'finished' ? 'Finalizada · aguardando a próxima rodada' : 'Em andamento'}</p>
          </div>
          {/* Duas colunas só em tela larga (TV Full HD): abaixo disso o nome cortava com "…". */}
          <div className="grid gap-3 2xl:grid-cols-2">
            {(pairings ?? []).map((pairing) => (
              <TvPairingCard key={pairing.pairing_id} pairing={pairing} locale={locale} />
            ))}
          </div>
        </>
      )
    } standings={<TvStandings rows={standings} locale={locale} groupName={groupName} />} />
  );
}
