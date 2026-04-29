import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { sendTournamentNotification, notifyPlayerFollowers } from '@/lib/push';

type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*' | 'bye';

interface PairingRow {
  board: number;
  whiteInitial: number;
  blackInitial: number | null;
  result: GameResult;
  whitePoints: number | null;
  blackPoints: number | null;
  isBye: boolean;
}

interface ParsedFile {
  roundNumber: number;
  pairings: PairingRow[];
}

function parseResult(raw: unknown): { result: GameResult; whitePoints: number | null; blackPoints: number | null } {
  const s = String(raw ?? '').trim();
  if (s === '1 - 0') return { result: '1-0', whitePoints: 1.0, blackPoints: 0.0 };
  if (s === '0 - 1') return { result: '0-1', whitePoints: 0.0, blackPoints: 1.0 };
  if (s.includes('½') || s.includes('1/2')) return { result: '1/2-1/2', whitePoints: 0.5, blackPoints: 0.5 };
  return { result: '*', whitePoints: null, blackPoints: null };
}

function parseExcel(buffer: ArrayBuffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

  // Extract round number from metadata rows (e.g. "5. Ronda a 2026/04/11…")
  let roundNumber = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const cell = String((raw[i] as unknown[])?.[0] ?? '').trim();
    const m = cell.match(/^(\d+)\.\s*Ronda/i) ?? cell.match(/Ronda\s+(\d+)/i) ?? cell.match(/Round\s+(\d+)/i);
    if (m) { roundNumber = parseInt(m[1], 10); break; }
  }
  if (!roundNumber) throw new Error('Número da rodada não encontrado no arquivo.');

  // Find header row (contains "Resultado")
  let dataStart = -1;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (row?.some((c) => String(c ?? '').trim() === 'Resultado')) {
      dataStart = i + 1;
      break;
    }
  }
  if (dataStart === -1) throw new Error('Formato inválido: coluna "Resultado" não encontrada.');

  const pairings: PairingRow[] = [];
  for (let i = dataStart; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row[0] == null) continue;
    const board = Number(row[0]);
    if (isNaN(board) || board <= 0) continue;

    const whiteInitial = Number(row[1]);
    const blackName = String(row[12] ?? '').trim().toLowerCase();
    const isBye = blackName === 'não emparceirado' || row[17] == null;
    const blackInitial = isBye ? null : Number(row[17]);

    if (isBye) {
      pairings.push({
        board,
        whiteInitial,
        blackInitial: null,
        result: 'bye',
        whitePoints: 1.0,
        blackPoints: null,
        isBye: true,
      });
    } else {
      const { result, whitePoints, blackPoints } = parseResult(row[9]);
      pairings.push({ board, whiteInitial, blackInitial, result, whitePoints, blackPoints, isBye: false });
    }
  }

  if (pairings.length === 0) throw new Error('Nenhum emparceiramento encontrado no arquivo.');
  return { roundNumber, pairings };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, created_by, rounds_count')
    .eq('slug', slug)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });
  if (tournament.created_by !== user.id)
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });

  let parsed: ParsedFile;
  try {
    parsed = parseExcel(await file.arrayBuffer());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  const { roundNumber, pairings } = parsed;

  // Find the round (must already exist)
  const { data: round } = await supabase
    .from('rounds')
    .select('id, status')
    .eq('tournament_id', tournament.id)
    .eq('round_number', roundNumber)
    .single();

  if (!round)
    return NextResponse.json(
      { error: `Rodada ${roundNumber} não encontrada. Crie a rodada antes de importar os emparceiramentos.` },
      { status: 422 }
    );

  // Load tournament players indexed by initial_ranking
  const { data: tPlayers } = await supabase
    .from('tournament_players')
    .select('id, initial_ranking')
    .eq('tournament_id', tournament.id);

  const byInitial = new Map((tPlayers ?? []).map((tp) => [tp.initial_ranking, tp.id]));

  const toInsert: object[] = [];
  const unmatched: string[] = [];

  for (const p of pairings) {
    const whiteTpId = byInitial.get(p.whiteInitial);
    if (!whiteTpId) { unmatched.push(`branco #${p.whiteInitial}`); continue; }

    const blackTpId = p.blackInitial != null ? byInitial.get(p.blackInitial) : undefined;
    if (!p.isBye && p.blackInitial != null && !blackTpId) {
      unmatched.push(`preto #${p.blackInitial}`);
    }

    toInsert.push({
      tournament_id: tournament.id,
      round_id: round.id,
      board_number: p.board,
      white_tp_id: whiteTpId,
      black_tp_id: blackTpId ?? null,
      result: p.result,
      white_points: p.whitePoints,
      black_points: p.blackPoints,
      is_bye: p.isBye,
    });
  }

  if (toInsert.length === 0)
    return NextResponse.json({ error: 'Nenhum emparceiramento pôde ser associado aos jogadores cadastrados.' }, { status: 422 });

  // Replace pairings for this round
  await supabase.from('pairings').delete().eq('round_id', round.id);
  const { error: insertError } = await supabase.from('pairings').insert(toInsert);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Mark round as ongoing if it was pending
  if (round.status === 'pending') {
    await supabase.from('rounds').update({ status: 'ongoing' }).eq('id', round.id);
  }

  // Notify subscribers
  const { data: t } = await supabase.from('tournaments').select('name, slug').eq('id', tournament.id).single();
  if (t) {
    const roundUrl = `/tournaments/${t.slug}/rounds/${roundNumber}`;

    // Tournament-wide notification
    sendTournamentNotification(tournament.id, {
      title: t.name,
      body: `Rodada ${roundNumber} publicada — ${toInsert.length} emparceiramentos`,
      url: roundUrl,
    }).catch(() => {});

    // Per-player notifications for followed players
    const inserted = toInsert as Array<{ white_tp_id: string; black_tp_id: string | null; is_bye: boolean }>;

    // Fetch names for all tp_ids involved
    const allTpIds = [...new Set(inserted.flatMap((p) => [p.white_tp_id, p.black_tp_id].filter(Boolean) as string[]))];
    const { data: tpNames } = await supabase
      .from('tournament_players')
      .select('id, players(full_name)')
      .in('id', allTpIds);
    const nameMap = new Map((tpNames ?? []).map((tp) => [tp.id, (tp as any).players?.full_name ?? '']));

    const notifyPlayers = inserted.flatMap((p) => {
      const entries = [];
      if (p.white_tp_id) entries.push({
        tpId: p.white_tp_id,
        makePayload: (_name: string) => ({
          title: t.name,
          body: p.is_bye
            ? `R${roundNumber}: ${nameMap.get(p.white_tp_id)} recebe BYE`
            : `R${roundNumber}: ${nameMap.get(p.white_tp_id)} (Brancas) × ${nameMap.get(p.black_tp_id!) ?? '?'}`,
          url: roundUrl,
        }),
      });
      if (p.black_tp_id) entries.push({
        tpId: p.black_tp_id,
        makePayload: (_name: string) => ({
          title: t.name,
          body: `R${roundNumber}: ${nameMap.get(p.black_tp_id!)} (Pretas) × ${nameMap.get(p.white_tp_id)}`,
          url: roundUrl,
        }),
      });
      return entries;
    });

    notifyPlayerFollowers(tournament.id, notifyPlayers).catch(() => {});
  }

  return NextResponse.json({ roundNumber, imported: toInsert.length, unmatched: unmatched.length, unmatchedPlayers: unmatched });
}
