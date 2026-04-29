import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';

interface StandingRow {
  rank: number;
  initialRanking: number;
  name: string;
  points: number;
  buchholz: number;
  buchholzCut1: number;
  sonnebornBerger: number;
}

function parseExcel(buffer: ArrayBuffer): StandingRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

  // Find the header row that contains "Nome"
  let dataStart = -1;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (row?.some((cell) => String(cell ?? '').trim() === 'Nome')) {
      dataStart = i + 1;
      break;
    }
  }
  if (dataStart === -1) throw new Error('Formato inválido: coluna "Nome" não encontrada.');

  const rows: StandingRow[] = [];
  for (let i = dataStart; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row[0] == null) continue;
    const rank = Number(row[0]);
    if (isNaN(rank) || rank <= 0) continue;

    rows.push({
      rank,
      initialRanking: Number(row[1]) || 0,
      name: String(row[3] ?? '').trim(),
      points: Number(row[9]) || 0,
      buchholz: Number(row[10]) || 0,
      buchholzCut1: Number(row[11]) || 0,
      sonnebornBerger: Number(row[12]) || 0,
    });
  }

  if (rows.length === 0) throw new Error('Nenhum jogador encontrado no arquivo.');
  return rows;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  // Get tournament and verify ownership
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, created_by')
    .eq('slug', slug)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });
  if (tournament.created_by !== user.id)
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  // Parse file
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });

  let rows: StandingRow[];
  try {
    const buffer = await file.arrayBuffer();
    rows = parseExcel(buffer);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  // Load tournament players indexed by initial_ranking
  const { data: tPlayers } = await supabase
    .from('tournament_players')
    .select('id, initial_ranking')
    .eq('tournament_id', tournament.id);

  const byInitialRanking = new Map((tPlayers ?? []).map((tp) => [tp.initial_ranking, tp.id]));

  const matched: { tournament_player_id: string; row: StandingRow }[] = [];
  const unmatched: string[] = [];

  for (const row of rows) {
    const tpId = byInitialRanking.get(row.initialRanking);
    if (tpId) {
      matched.push({ tournament_player_id: tpId, row });
    } else {
      unmatched.push(`#${row.initialRanking} ${row.name}`);
    }
  }

  if (matched.length === 0)
    return NextResponse.json({ error: 'Nenhum jogador pôde ser associado. Verifique se os jogadores foram cadastrados com o número inicial correto.' }, { status: 422 });

  // Upsert standings
  const standingsUpsert = matched.map(({ tournament_player_id, row }) => ({
    tournament_id: tournament.id,
    tournament_player_id,
    rank: row.rank,
    points: row.points,
    buchholz: row.buchholz,
    buchholz_cut1: row.buchholzCut1,
    sonneborn_berger: row.sonnebornBerger,
    updated_at: new Date().toISOString(),
  }));

  const { error: standingsError } = await supabase
    .from('standings')
    .upsert(standingsUpsert, { onConflict: 'tournament_id,tournament_player_id' });

  if (standingsError) return NextResponse.json({ error: standingsError.message }, { status: 500 });

  // Sync tournament_players scores and rankings
  for (const { tournament_player_id, row } of matched) {
    await supabase
      .from('tournament_players')
      .update({
        current_score: row.points,
        current_rank: row.rank,
        buchholz: row.buchholz,
        buchholz_cut1: row.buchholzCut1,
        sonneborn_berger: row.sonnebornBerger,
      })
      .eq('id', tournament_player_id);
  }

  return NextResponse.json({
    matched: matched.length,
    unmatched: unmatched.length,
    unmatchedPlayers: unmatched,
  });
}
