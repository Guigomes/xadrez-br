import { createAdminClient } from '@/lib/supabase/server';
import { buildCertificatePdf } from '@/lib/pdf/certificate';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from('tournament_players')
    .select('id, current_score, current_rank, players(full_name), tournaments(name, slug, status, is_public, start_date, end_date), tournament_categories(name)')
    .eq('id', id).maybeSingle();
  const row = data as unknown as {
    current_score: number; current_rank: number | null;
    players: { full_name: string } | null;
    tournaments: { name: string; slug: string; status: string; is_public: boolean; start_date: string; end_date: string | null } | null;
    tournament_categories: { name: string } | null;
  } | null;
  if (!row?.players || !row.tournaments?.is_public) return new Response('Não encontrado', { status: 404 });
  if (row.tournaments.status !== 'finished') return new Response('Certificado disponível após o encerramento.', { status: 409 });

  const { count } = await admin.from('pairings').select('id', { count: 'exact', head: true })
    .or(`white_tp_id.eq.${id},black_tp_id.eq.${id}`).neq('result', '*');
  if (!count) return new Response('Participação não confirmada.', { status: 409 });

  const origin = new URL(request.url).origin;
  const pdf = buildCertificatePdf({
    playerName: row.players.full_name,
    tournamentName: row.tournaments.name,
    dateLabel: new Date(row.tournaments.end_date ?? row.tournaments.start_date).toLocaleDateString('pt-BR'),
    rank: row.current_rank,
    points: row.current_score,
    category: row.tournament_categories?.name,
    validationUrl: `${origin}/certificados/${id}`,
  });
  const filename = `certificado-${row.tournaments.slug}.pdf`;
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'public, max-age=3600' } });
}
