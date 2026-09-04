import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeNameKey } from './normalize';

// Portado de ../../cron-import/src/import-pairings.ts — ver aviso de
// duplicação em process-tournament.ts.

type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*' | 'bye' | 'forfeit_white' | 'forfeit_black' | 'double_forfeit';

interface PairingRow {
  board: number;
  whiteName: string;
  blackName: string | null;
  result: GameResult;
  whitePoints: number | null;
  blackPoints: number | null;
  isBye: boolean;
  /** Nº. inicial de cada lado, quando a planilha traz a coluna. Ver byRank. */
  whiteNo: number | null;
  blackNo: number | null;
}

interface ParsedFile {
  roundNumber: number;
  pairings: PairingRow[];
}

function parseResult(raw: unknown): {
  result: GameResult;
  whitePoints: number | null;
  blackPoints: number | null;
} {
  const s = String(raw ?? '').trim();
  if (s === '1 - 0') return { result: '1-0', whitePoints: 1.0, blackPoints: 0.0 };
  if (s === '0 - 1') return { result: '0-1', whitePoints: 0.0, blackPoints: 1.0 };
  if (s.includes('½') || s.includes('1/2'))
    return { result: '1/2-1/2', whitePoints: 0.5, blackPoints: 0.5 };

  // W.O. (jogador não compareceu): chess-results marca "+" do lado de quem
  // venceu por ausência do adversário e "-" do lado ausente.
  const wo = s.replace(/\s+/g, '');
  if (wo === '--+') return { result: 'forfeit_white', whitePoints: 0, blackPoints: 1 };
  if (wo === '+--') return { result: 'forfeit_black', whitePoints: 1, blackPoints: 0 };
  if (wo === '---') return { result: 'double_forfeit', whitePoints: 0, blackPoints: 0 };

  return { result: '*', whitePoints: null, blackPoints: null };
}

function parseExcel(buffer: ArrayBuffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

  // The "X. Ronda" / "Round X" header sits below the tournament metadata block.
  let roundNumber = 0;
  for (let i = 0; i < Math.min(30, raw.length); i++) {
    const cell = String((raw[i] as unknown[])?.[0] ?? '').trim();
    const m =
      cell.match(/^(\d+)\.\s*Ronda/i) ??
      cell.match(/Ronda\s+(\d+)/i) ??
      cell.match(/Round\s+(\d+)/i);
    if (m) {
      roundNumber = parseInt(m[1], 10);
      break;
    }
  }
  if (!roundNumber) throw new Error('Número da rodada não encontrado.');

  // Locate the column header row and capture the actual indexes — the layout varies.
  let dataStart = -1;
  let whiteNameIdx = 1;
  let resultIdx = -1;
  let blackNameIdx = -1;
  let whiteNoIdx = -1;
  let blackNoIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row) continue;
    const cells = row.map((c) => String(c ?? '').trim());
    const rIdx = cells.findIndex((c) => c === 'Resultado' || /^Result/i.test(c));
    if (rIdx < 0) continue;
    resultIdx = rIdx;
    const wIdx = cells.findIndex((c) => c === 'White');
    const bIdx = cells.findIndex((c) => c === 'Black');
    if (wIdx >= 0) whiteNameIdx = wIdx;
    blackNameIdx = bIdx >= 0 ? bIdx : rIdx + 2;

    // Colunas "Nº." (ranking inicial) — presentes quando o torneio usa rating.
    const noIdxs = cells
      .map((c, idx) => (/^n[ºo°]?\.?$/i.test(c) ? idx : -1))
      .filter((idx) => idx >= 0);
    if (noIdxs.length >= 2) {
      whiteNoIdx = noIdxs[0];
      blackNoIdx = noIdxs[noIdxs.length - 1];
    }

    dataStart = i + 1;
    break;
  }
  if (dataStart === -1) throw new Error('Coluna "Resultado" não encontrada.');

  const pairings: PairingRow[] = [];
  for (let i = dataStart; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row[0] == null) continue;
    const board = Number(row[0]);
    if (isNaN(board) || board <= 0) continue;

    const whiteName = String(row[whiteNameIdx] ?? '').trim();
    if (!whiteName) continue;

    const num = (idx: number): number | null => {
      if (idx < 0) return null;
      const n = Number(String(row[idx] ?? '').trim());
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const whiteNo = num(whiteNoIdx);
    const blackNo = num(blackNoIdx);

    const rawBlack = String(row[blackNameIdx] ?? '').trim();
    const blackLower = rawBlack.toLowerCase();
    const isBye =
      blackLower === 'bye' ||
      blackLower === 'não emparceirado' ||
      rawBlack === '';

    if (isBye) {
      // Bye rows in the 8-col layout: col[resultIdx] is the numeric point
      // value (1 or 0.5), not "1 - 0".
      const points = Number(row[resultIdx]);
      pairings.push({
        board,
        whiteName,
        blackName: null,
        result: 'bye',
        whitePoints: Number.isFinite(points) && points > 0 ? points : 1.0,
        blackPoints: null,
        isBye: true,
        whiteNo,
        blackNo,
      });
    } else {
      const { result, whitePoints, blackPoints } = parseResult(row[resultIdx]);
      pairings.push({
        board,
        whiteName,
        blackName: rawBlack,
        result,
        whitePoints,
        blackPoints,
        isBye: false,
        whiteNo,
        blackNo,
      });
    }
  }

  return { roundNumber, pairings };
}

export interface ImportPairingsResult {
  roundNumber: number;
  imported: number;
  unmatched: number;
  /** id da rodada resolvida (null quando não havia dados para resolver). */
  roundId: string | null;
  /** true quando a rodada transicionou para um estado publicado nesta execução
   *  (pending → ongoing/finished, ou ongoing → finished) — sinal para notificar. */
  published: boolean;
}

export async function importPairings(
  supabase: SupabaseClient,
  tournamentId: string,
  fileBuffer: ArrayBuffer,
  pairingGroupId: string | null = null,
): Promise<ImportPairingsResult> {
  const { roundNumber, pairings } = parseExcel(fileBuffer);
  if (pairings.length === 0) {
    return { roundNumber, imported: 0, unmatched: 0, roundId: null, published: false };
  }

  // Find or create round scoped to this pairing group.
  let roundQuery = supabase
    .from('rounds')
    .select('id, status')
    .eq('tournament_id', tournamentId)
    .eq('round_number', roundNumber);

  if (pairingGroupId) {
    roundQuery = roundQuery.eq('pairing_group_id', pairingGroupId);
  } else {
    roundQuery = roundQuery.is('pairing_group_id', null);
  }

  let { data: round } = await roundQuery.maybeSingle();

  if (!round) {
    const { data: created } = await supabase
      .from('rounds')
      .insert({
        tournament_id: tournamentId,
        round_number: roundNumber,
        status: 'pending',
        pairing_group_id: pairingGroupId ?? null,
      })
      .select('id, status')
      .single();
    round = created;
  }
  if (!round) throw new Error(`Não foi possível resolver a rodada ${roundNumber}`);

  // Build player lookup by name scoped to this group (normalizeNameKey —
  // ver comentário no arquivo original sobre por que não é string exata).
  let playersQuery = supabase
    .from('tournament_players')
    .select('id, initial_ranking, player:players(full_name)')
    .eq('tournament_id', tournamentId);

  if (pairingGroupId) {
    playersQuery = playersQuery.eq('pairing_group_id', pairingGroupId);
  }

  const { data: tPlayers } = await playersQuery;

  const byName = new Map<string, string>();
  // Fallback por Nº. inicial, quando a planilha de pareamento traz a coluna.
  const byRank = new Map<number, string>();
  for (const tp of tPlayers ?? []) {
    const fullName = ((tp.player as unknown) as { full_name?: string } | null)?.full_name ?? '';
    const key = normalizeNameKey(fullName);
    if (key) byName.set(key, tp.id as string);
    const rank = tp.initial_ranking as number | null;
    if (rank != null) byRank.set(rank, tp.id as string);
  }

  const toInsert: Record<string, unknown>[] = [];
  let unmatched = 0;

  for (const p of pairings) {
    // Um lado não casar não derruba a mesa inteira — guarda quem casou, conta
    // quem não casou, só descarta a linha se NINGUÉM dos dois lados casou.
    const whiteTpId =
      byName.get(normalizeNameKey(p.whiteName)) ??
      (p.whiteNo != null ? byRank.get(p.whiteNo) : undefined);
    if (!whiteTpId) unmatched++;

    const blackTpId = p.blackName
      ? byName.get(normalizeNameKey(p.blackName)) ??
        (p.blackNo != null ? byRank.get(p.blackNo) : undefined)
      : undefined;
    if (!p.isBye && p.blackName && !blackTpId) unmatched++;

    if (!whiteTpId && !blackTpId) continue;

    toInsert.push({
      tournament_id: tournamentId,
      round_id: round.id,
      board_number: p.board,
      white_tp_id: whiteTpId ?? null,
      black_tp_id: blackTpId ?? null,
      result: p.result,
      white_points: p.whitePoints,
      black_points: p.blackPoints,
      is_bye: p.isBye,
    });
  }

  if (toInsert.length === 0) {
    return { roundNumber, imported: 0, unmatched, roundId: round.id as string, published: false };
  }

  // Replace pairings for this round (idempotent re-run)
  await supabase.from('pairings').delete().eq('round_id', round.id);
  const { error } = await supabase.from('pairings').insert(toInsert);
  if (error) throw new Error(error.message);

  // Advance round status:
  //   pending  → ongoing  when pairings are published but some games are still '*'
  //   ongoing  → finished when every game has a final result (and there's at least one)
  const hasResults = pairings.length > 0;
  const allHaveResults = hasResults && pairings.every((p) => p.result !== '*');
  const desired = allHaveResults ? 'finished' : 'ongoing';
  const published = round.status !== desired;
  if (published) {
    await supabase.from('rounds').update({ status: desired }).eq('id', round.id);
  }

  return {
    roundNumber,
    imported: toInsert.length,
    unmatched,
    roundId: round.id as string,
    published,
  };
}
