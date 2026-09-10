import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/data/session';
import { Badge } from '@/components/ui/badge';
import { Gambito } from '@/components/mascot/gambito';
import { CheckinButton } from '@/components/player-hub/checkin-button';
import { PayRegistrationButton } from '@/components/player-hub/pay-registration-button';
import { ShareResultButton } from '@/components/player-hub/share-result-button';

type HubEntry = {
  id: string;
  player_id: string;
  current_score: number;
  current_rank: number | null;
  checkin_status: string;
  checked_in_at: string | null;
  players: { full_name: string } | null;
  tournaments: {
    id: string; slug: string; name: string; status: string; start_date: string;
    checkin_enabled: boolean; checkin_opens_at: string | null; checkin_closes_at: string | null;
  } | null;
};

type HubPairing = {
  board_number: number | null;
  white_tp_id: string | null;
  black_tp_id: string | null;
  rounds: { round_number: number; status: string } | null;
  white: { players: { full_name: string } | null } | null;
  black: { players: { full_name: string } | null } | null;
};

type HubRegistration = {
  id: string;
  status: string;
  is_waitlisted: boolean;
  payment_status: string;
  tournaments: { slug: string; name: string; start_date: string };
};

export default async function PlayerHubPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/minha-area');
  const admin = createAdminClient();

  const { data: links } = await admin
    .from('user_player_links').select('player_id').eq('user_id', user.id).eq('status', 'verified');
  const playerIds = (links ?? []).map((link) => link.player_id);

  const [{ data: entriesRaw }, { data: registrations }] = await Promise.all([
    playerIds.length
      ? admin.from('tournament_players')
          .select('id, player_id, current_score, current_rank, checkin_status, checked_in_at, players(full_name), tournaments(id, slug, name, status, start_date, checkin_enabled, checkin_opens_at, checkin_closes_at)')
          .in('player_id', playerIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    admin.from('tournament_registrations')
      .select('id, status, is_waitlisted, payment_status, created_at, tournaments(slug, name, start_date)')
      .eq('user_id', user.id).order('created_at', { ascending: false }),
  ]);
  const entries = (entriesRaw ?? []) as unknown as HubEntry[];

  const withPairings = await Promise.all(entries.map(async (entry) => {
    const { data } = await admin.from('pairings')
      .select('board_number, result, white_tp_id, black_tp_id, white:tournament_players!pairings_white_tp_id_fkey(players(full_name)), black:tournament_players!pairings_black_tp_id_fkey(players(full_name)), rounds!inner(round_number, status)')
      .or(`white_tp_id.eq.${entry.id},black_tp_id.eq.${entry.id}`)
      .eq('rounds.status', 'ongoing').order('created_at', { ascending: false }).limit(1).maybeSingle();
    return { ...entry, nextPairing: data as unknown as HubPairing | null };
  }));

  const now = Date.now();
  const active = withPairings.filter((entry) => entry.tournaments?.status !== 'finished' && entry.tournaments?.status !== 'cancelled');
  const past = withPairings.filter((entry) => entry.tournaments?.status === 'finished');

  return (
    <div className="container-app py-8">
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-brand-50 p-5 pr-28 dark:bg-brand-950/30 sm:pr-44">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Minha área de jogador</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Partidas, colocações, inscrições e presença em um só lugar.</p>
        <Gambito pose="classificacao" alt="" className="absolute -bottom-8 right-2 w-32 sm:right-8 sm:w-44" />
      </div>

      {playerIds.length === 0 && (
        <div className="card mb-6 p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Vincule seu histórico</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Seu jogador será vinculado automaticamente quando uma inscrição feita com esta conta for aprovada. IDs CBX ou FIDE iguais aos da sua conta também são reconhecidos.</p>
          <Link href="/account" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">Completar meus dados →</Link>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-gray-900 dark:text-gray-100">Agora</h2>
        {active.length === 0 ? <p className="card p-5 text-sm text-gray-500">Nenhum torneio ativo vinculado.</p> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {active.map((entry) => {
              const t = entry.tournaments!;
              const p = entry.nextPairing;
              const mineWhite = p?.white_tp_id === entry.id;
              const opponent = mineWhite ? p?.black?.players?.full_name : p?.white?.players?.full_name;
              const checkinOpen = t.checkin_enabled && (!t.checkin_opens_at || now >= new Date(t.checkin_opens_at).getTime()) && (!t.checkin_closes_at || now <= new Date(t.checkin_closes_at).getTime());
              return (
                <article key={entry.id} className="card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</h3><p className="text-sm text-gray-500">{entry.players?.full_name}</p></div>
                    <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">{entry.current_score} pts · {entry.current_rank ? `${entry.current_rank}º` : 'sem posição'}</Badge>
                  </div>
                  {p && <div className="mt-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-800"><p className="text-sm font-semibold">Rodada {p.rounds?.round_number}{p.board_number ? ` · Mesa ${p.board_number}` : ''}</p><p className="mt-1 text-sm">{opponent ? `${mineWhite ? 'Brancas' : 'Pretas'} contra ${opponent}` : 'BYE'}</p></div>}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {entry.checkin_status === 'checked_in' ? <span className="text-sm font-semibold text-green-600">✓ Presença confirmada</span> : checkinOpen ? <CheckinButton tournamentPlayerId={entry.id} /> : null}
                    <Link href={`/tournaments/${t.slug}/players/${entry.id}`} className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">Ver histórico</Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {(registrations ?? []).length > 0 && <section className="mb-8"><h2 className="mb-3 text-lg font-bold">Minhas inscrições</h2><div className="space-y-2">{(registrations as unknown as HubRegistration[]).map((r) => <div key={r.id} className="card flex items-center justify-between gap-3 p-4"><Link href={`/tournaments/${r.tournaments.slug}`} className="min-w-0 font-medium hover:text-brand-600">{r.tournaments.name}</Link><div className="flex shrink-0 items-center gap-2"><Badge className={r.is_waitlisted ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}>{r.is_waitlisted ? 'Lista de espera' : r.status === 'approved' ? 'Aprovada' : r.status === 'rejected' ? 'Rejeitada' : r.payment_status === 'pending' ? 'Vaga liberada' : 'Em análise'}</Badge>{!r.is_waitlisted && r.payment_status === 'pending' && <PayRegistrationButton registrationId={r.id} />}</div></div>)}</div></section>}

      {past.length > 0 && <section><h2 className="mb-3 text-lg font-bold">Histórico</h2><div className="grid gap-3 sm:grid-cols-2">{past.map((entry) => <div key={entry.id} className="card p-4"><p className="font-semibold">{entry.tournaments?.name}</p><p className="mt-1 text-sm text-gray-500">{entry.current_score} pontos · {entry.current_rank ? `${entry.current_rank}º lugar` : 'sem posição'}</p><div className="mt-3 flex flex-wrap items-center gap-3"><Link href={`/tournaments/${entry.tournaments?.slug}/players/${entry.id}`} className="text-sm text-brand-600 hover:underline">Desempenho</Link><a href={`/api/certificates/${entry.id}`} className="text-sm text-brand-600 hover:underline">Certificado</a><ShareResultButton tournamentPlayerId={entry.id} playerName={entry.players?.full_name ?? 'Jogador'} /></div></div>)}</div></section>}
    </div>
  );
}
