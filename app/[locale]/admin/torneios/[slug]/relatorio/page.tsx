import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isCheckinEnabled } from '@/lib/data/checkin';
import { PrintReportButton } from '@/components/admin/print-report-button';
import { compareGroupNames } from '@/lib/utils/chess';
import { SettlementCard, type Settlement } from '@/components/finance/settlement-card';

interface StandingRow {
  rank: number | null;
  tp_id: string;
  full_name: string;
  title: string | null;
  points: number;
  rating_std: number | null;
  state: string | null;
  federation: string | null;
  category_name: string | null;
  sex: string | null;
}

/**
 * Relatório do torneio: dados gerais, resultados das partidas e pódio por categoria — para
 * nativo E importado. A parte de inscrições/pagamento/check-in só existe no nativo (no
 * importado o elenco vem do chess-results), então só aparece nele. Com o torneio ainda em
 * andamento, o relatório é parcial e diz isso no topo.
 */
export default async function TournamentReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase.from('tournaments')
    .select('id, name, start_date, end_date, city, state, registration_fee_cents, mode, status, rounds_count, has_absolute_classification, has_female_classification')
    .eq('slug', slug).maybeSingle();
  if (!tournament) notFound();

  const isNative = tournament.mode === 'native';
  const checkinOn = await isCheckinEnabled();
  const [{ data: players }, { data: registrations }, { data: rounds }, { data: pairings }, { data: standingsRaw }, { data: pgnCount }] = await Promise.all([
    supabase.from('tournament_players').select('status, checkin_status').eq('tournament_id', tournament.id),
    isNative
      ? supabase.from('tournament_registrations').select('status, payment_status, is_waitlisted').eq('tournament_id', tournament.id)
      : Promise.resolve({ data: [] as Array<{ status: string; payment_status: string | null; is_waitlisted: boolean }> }),
    supabase.from('rounds').select('round_number, status').eq('tournament_id', tournament.id),
    supabase.from('pairings').select('result, is_bye').eq('tournament_id', tournament.id),
    supabase.rpc('get_tournament_standings', { p_tournament_id: tournament.id }),
    supabase.rpc('get_tournament_pgn_count', { p_tournament_id: tournament.id }),
  ]);
  // Financeiro: só organizador ou admin (a função recusa os demais — aí o bloco some).
  const { data: settlementRows } = isNative
    ? await supabase.rpc('get_tournament_settlement', { p_tournament_id: tournament.id })
    : { data: null };
  const settlement = (Array.isArray(settlementRows) ? settlementRows[0] : null) as Settlement | null;
  const standings = (standingsRaw ?? []) as StandingRow[];

  // ---- partidas ----
  const games = (pairings ?? []).filter((p) => !p.is_bye);
  const played = games.filter((p) => p.result === '1-0' || p.result === '0-1' || p.result === '1/2-1/2');
  const whiteWins = played.filter((p) => p.result === '1-0').length;
  const blackWins = played.filter((p) => p.result === '0-1').length;
  const draws = played.filter((p) => p.result === '1/2-1/2').length;
  const forfeits = games.filter((p) => String(p.result).includes('forfeit')).length;
  const pending = games.filter((p) => p.result === '*').length;
  const byes = (pairings ?? []).filter((p) => p.is_bye).length;
  const pct = (n: number) => (played.length ? `${Math.round((n / played.length) * 100)}%` : '–');

  // ---- rodadas ----
  const roundNumbers = [...new Set((rounds ?? []).map((r) => r.round_number))];
  const finishedRounds = roundNumbers.filter((n) => (rounds ?? []).filter((r) => r.round_number === n).every((r) => r.status === 'finished')).length;
  const isFinal = tournament.status === 'finished';

  // ---- jogadores ----
  const rated = standings.filter((s) => (s.rating_std ?? 0) > 0);
  const avgRating = rated.length ? Math.round(rated.reduce((a, s) => a + (s.rating_std ?? 0), 0) / rated.length) : null;
  const women = standings.filter((s) => s.sex === 'w').length;
  const byState = countBy(standings.map((s) => s.state || null));
  const foreign = standings.filter((s) => s.federation && s.federation !== 'BRA').length;

  // ---- classificações ----
  const ranked = [...standings].filter((s) => s.rank != null).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const top = ranked.slice(0, 3);
  const categoryNames = [...new Set(standings.map((s) => s.category_name).filter((n): n is string => !!n))].sort(compareGroupNames);
  const categories = categoryNames.map((name) => {
    const rows = ranked.filter((s) => s.category_name === name);
    return { name, count: standings.filter((s) => s.category_name === name).length, podium: rows.slice(0, 3) };
  });
  if (tournament.has_female_classification) {
    const rows = ranked.filter((s) => s.sex === 'w');
    if (rows.length) categories.push({ name: 'Feminino', count: women, podium: rows.slice(0, 3) });
  }

  // ---- inscrições (só nativo) ----
  const paid = (registrations ?? []).filter((r) => r.payment_status === 'paid').length;
  const checkins = (players ?? []).filter((p) => p.checkin_status === 'checked_in').length;

  return (
    <div className="mx-auto max-w-4xl print:max-w-none">
      <header className="mb-6 flex items-start justify-between gap-4 print:block">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
            {isFinal ? 'Relatório pós-torneio' : 'Relatório parcial'}
          </p>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {tournament.city}, {tournament.state} · {formatDate(tournament.start_date)}
            {tournament.end_date && tournament.end_date !== tournament.start_date ? ` a ${formatDate(tournament.end_date)}` : ''}
          </p>
          {!isFinal && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Torneio ainda em andamento: os números mudam até a última rodada.
            </p>
          )}
        </div>
        <div className="print:hidden"><PrintReportButton /></div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Participantes" value={String(players?.length ?? 0)} />
        <Metric label="Rodadas finalizadas" value={`${finishedRounds}/${tournament.rounds_count}`} />
        <Metric label="Partidas jogadas" value={String(played.length)} />
        {isNative && checkinOn
          ? <Metric label="Check-ins" value={String(checkins)} />
          : <Metric label="Partidas com lances" value={String(pgnCount ?? 0)} />}
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-bold">Resultados das partidas</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Vitórias das brancas" value={`${whiteWins} (${pct(whiteWins)})`} />
            <Row label="Vitórias das pretas" value={`${blackWins} (${pct(blackWins)})`} />
            <Row label="Empates" value={`${draws} (${pct(draws)})`} />
            <Row label="W.O." value={forfeits} />
            <Row label="Byes / não emparceirados" value={byes} />
            {pending > 0 && <Row label="Ainda sem resultado" value={pending} />}
          </dl>
        </div>
        <div className="card p-5">
          <h2 className="font-bold">Jogadores</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Rating médio" value={avgRating ?? '–'} />
            <Row label="Com rating" value={`${rated.length} de ${standings.length}`} />
            {women > 0 && <Row label="Mulheres" value={women} />}
            {foreign > 0 && <Row label="Estrangeiros" value={foreign} />}
            {byState.slice(0, 4).map(([uf, n]) => <Row key={uf} label={uf === 'null' ? 'UF não informada' : uf} value={n} />)}
          </dl>
        </div>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        {tournament.has_absolute_classification !== false && (
          <div className="card p-5">
            <h2 className="font-bold">Pódio absoluto</h2>
            <Podium rows={top} />
          </div>
        )}
        {isNative && (
          <div className="card p-5">
            <h2 className="font-bold">Inscrições</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Recebidas" value={registrations?.length ?? 0} />
              <Row label="Aprovadas" value={(registrations ?? []).filter((r) => r.status === 'approved').length} />
              <Row label="Ainda na espera" value={(registrations ?? []).filter((r) => r.is_waitlisted).length} />
              <Row label="Pagamentos confirmados" value={paid} />

            </dl>
          </div>
        )}
      </section>

      {settlement && (settlement.paid_count > 0 || Number(settlement.paid_out_cents) > 0) && (
        <section className="mt-6"><SettlementCard s={settlement} /></section>
      )}

      {categories.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-bold">Por categoria</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
            {categories.map((c) => (
              <div key={c.name} className="card p-4 break-inside-avoid">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{c.name}</h3>
                  <span className="text-xs text-gray-500">{c.count} jogador{c.count !== 1 ? 'es' : ''}</span>
                </div>
                <Podium rows={c.podium} compact />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');
}

function countBy(values: Array<string | null>): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const v of values) m.set(String(v), (m.get(String(v)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Podium({ rows, compact = false }: { rows: StandingRow[]; compact?: boolean }) {
  if (!rows.length) return <p className="mt-3 text-sm text-gray-500">Classificação ainda indisponível.</p>;
  return (
    <ol className={compact ? 'mt-2 space-y-1.5 text-sm' : 'mt-3 space-y-3'}>
      {rows.map((row, i) => (
        <li key={row.tp_id} className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <strong className="mr-2 text-brand-600">{i + 1}º</strong>
            {row.title && `${row.title} `}{row.full_name}
          </span>
          <span className="shrink-0 text-sm text-gray-500">{row.points} pts</span>
        </li>
      ))}
    </ol>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="card p-4"><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-3xl font-black text-gray-900 dark:text-gray-100">{value}</p></div>; }
function Row({ label, value }: { label: string; value: string | number }) { return <div className="flex justify-between gap-3"><dt className="text-gray-500">{label}</dt><dd className="font-semibold">{value}</dd></div>; }
