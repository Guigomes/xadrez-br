import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import QRCode from 'qrcode';
import { localizedTitle } from '@/lib/utils/player-title';
import { createAdminClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/seo';
import { TvControls } from '@/components/tournament/tv-controls';
import { WhitePawn, BlackPawn } from '@/components/tournament/piece-icons';

export const dynamic = 'force-dynamic';

export default async function TournamentTvPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
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

  // QR no lugar do link: a TV está longe demais para ninguém digitar endereço. SVG gerado aqui
  // no servidor (sem JS nem imagem no navegador), verde-escuro da marca sobre fundo branco.
  const followUrl = `${siteUrl()}/torneios/${slug}`;
  const qrSvg = await QRCode.toString(followUrl, {
    type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#113827', light: '#ffffff' },
  });

  // Torneio com um grupo só (o "Absoluto" de todo nativo) não precisa citar o grupo.
  const { count: groupCount } = await admin.from('pairing_groups')
    .select('id', { count: 'exact', head: true }).eq('tournament_id', tournament.id);
  const groupName = (groupCount ?? 0) > 1
    ? (round?.pairing_groups as unknown as { name: string } | null)?.name
    : null;

  return (
    <main className="chess-pattern fixed inset-0 z-50 overflow-auto bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 px-4 py-6 text-white sm:px-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.2em] text-brand-200">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl leading-none text-brand-700 shadow">♞</span>
            Gambito Torneios · Painel de chamada
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">{tournament.name}</h1>
          <p className="mt-2 text-lg text-brand-200">{tournament.city}, {tournament.state}</p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-4 rounded-2xl bg-white p-3 text-brand-900 shadow-lg">
            <div className="h-28 w-28 shrink-0 sm:h-32 sm:w-32 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="max-w-[9rem] text-sm font-bold leading-snug sm:text-base">
              Aponte a câmera e acompanhe pelo celular
            </p>
          </div>
          <TvControls />
        </div>
      </header>

      {!round ? (
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
          </div>
          {/* Duas colunas só em tela larga (TV Full HD): abaixo disso o nome cortava com "…". */}
          <div className="grid gap-3 2xl:grid-cols-2">
            {(pairings ?? []).map((pairing) => (
              <article
                key={pairing.pairing_id}
                className="grid grid-cols-[4.5rem_1fr_auto_1fr] items-center gap-3 rounded-2xl bg-white p-3 text-gray-900 shadow-md sm:grid-cols-[6rem_1fr_auto_1fr] sm:gap-4 sm:p-4"
              >
                <div className="rounded-xl bg-brand-50 py-1 text-center">
                  <span className="text-xs font-bold uppercase tracking-wide text-brand-600">Mesa</span>
                  <p className="text-4xl font-black leading-none text-brand-700 sm:text-5xl">{pairing.board_number ?? '—'}</p>
                </div>
                <PlayerName side="w" title={localizedTitle(pairing.white_title, locale)} name={pairing.white_name} align="right" />
                <span className="text-xl font-black text-brand-300">×</span>
                <PlayerName side="b" title={localizedTitle(pairing.black_title, locale)} name={pairing.black_name} />
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function PlayerName({ side, title, name, align = 'left' }: {
  side: 'w' | 'b'; title: string | null; name: string | null; align?: 'left' | 'right';
}) {
  const Pawn = side === 'w' ? WhitePawn : BlackPawn;
  const right = align === 'right';
  return (
    <div className={`flex min-w-0 items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <Pawn className="h-6 w-5 shrink-0 sm:h-8 sm:w-6" />
      <p className="min-w-0 truncate text-xl font-bold sm:text-3xl">
        {name ? (
          <>
            {title && <span className="mr-2 text-base font-semibold text-amber-600 sm:text-xl">{title}</span>}
            {name}
          </>
        ) : (
          <span className="font-semibold text-gray-400">Folga (bye)</span>
        )}
      </p>
    </div>
  );
}
