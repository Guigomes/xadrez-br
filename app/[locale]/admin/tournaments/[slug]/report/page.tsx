import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PrintReportButton } from '@/components/admin/print-report-button';

export default async function TournamentReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase.from('tournaments')
    .select('id, name, start_date, city, state, registration_fee_cents')
    .eq('slug', slug).maybeSingle();
  if (!tournament) notFound();

  const [{ data: players }, { data: registrations }, { data: rounds }, { data: pairings }, { data: standings }] = await Promise.all([
    supabase.from('tournament_players').select('status, checkin_status').eq('tournament_id', tournament.id),
    supabase.from('tournament_registrations').select('status, payment_status, is_waitlisted').eq('tournament_id', tournament.id),
    supabase.from('rounds').select('status').eq('tournament_id', tournament.id),
    supabase.from('pairings').select('result, is_bye').eq('tournament_id', tournament.id),
    supabase.rpc('get_tournament_standings', { p_tournament_id: tournament.id }),
  ]);
  const paid = (registrations ?? []).filter((r) => r.payment_status === 'paid').length;
  const completedGames = (pairings ?? []).filter((p) => p.result !== '*' && !p.is_bye).length;
  const checkins = (players ?? []).filter((p) => p.checkin_status === 'checked_in').length;
  const top = (standings ?? []).filter((s) => s.rank != null).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl print:max-w-none">
      <header className="mb-6 flex items-start justify-between gap-4 print:block">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Relatório pós-torneio</p><h1 className="text-2xl font-bold">{tournament.name}</h1><p className="mt-1 text-sm text-gray-500">{tournament.city}, {tournament.state} · {new Date(tournament.start_date).toLocaleDateString('pt-BR')}</p></div>
        <div className="print:hidden"><PrintReportButton /></div>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Participantes" value={String(players?.length ?? 0)} />
        <Metric label="Partidas concluídas" value={String(completedGames)} />
        <Metric label="Check-ins" value={String(checkins)} />
        <Metric label="Rodadas finalizadas" value={String((rounds ?? []).filter((r) => r.status === 'finished').length)} />
      </section>
      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="card p-5"><h2 className="font-bold">Inscrições</h2><dl className="mt-3 space-y-2 text-sm"><Row label="Recebidas" value={registrations?.length ?? 0} /><Row label="Aprovadas" value={(registrations ?? []).filter((r) => r.status === 'approved').length} /><Row label="Ainda na espera" value={(registrations ?? []).filter((r) => r.is_waitlisted).length} /><Row label="Pagamentos confirmados" value={paid} />{tournament.registration_fee_cents && <Row label="Receita bruta confirmada" value={(paid * tournament.registration_fee_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />}</dl></div>
        <div className="card p-5"><h2 className="font-bold">Pódio absoluto</h2><ol className="mt-3 space-y-3">{top.map((row) => <li key={row.tp_id} className="flex items-center justify-between gap-3"><span><strong className="mr-2 text-brand-600">{row.rank}º</strong>{row.title && `${row.title} `}{row.full_name}</span><span className="text-sm text-gray-500">{row.points} pts</span></li>)}{top.length === 0 && <li className="text-sm text-gray-500">Classificação ainda indisponível.</li>}</ol></div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="card p-4"><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-3xl font-black text-gray-900 dark:text-gray-100">{value}</p></div>; }
function Row({ label, value }: { label: string; value: string | number }) { return <div className="flex justify-between gap-3"><dt className="text-gray-500">{label}</dt><dd className="font-semibold">{value}</dd></div>; }
