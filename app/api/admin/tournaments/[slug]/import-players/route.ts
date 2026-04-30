import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';

interface ImportedParticipant {
  fullName: string;
  fideId?: string;
  federation?: string;
  ratingStd?: number;
  initialRanking?: number;
  category?: string;
  city?: string;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function colIndex(headers: string[], aliases: string[]) {
  const norm = aliases.map(normalize);
  return headers.findIndex((h) => norm.includes(normalize(h)));
}

function parseRows(rows: unknown[][]): ImportedParticipant[] {
  const asStr = rows.map((row) => row.map((c) => String(c ?? '').trim()));

  const headerIdx = asStr.findIndex(
    (row) => row.some((c) => normalize(c) === 'nome') && row.some((c) => normalize(c) === 'id fide')
  );
  if (headerIdx < 0) throw new Error('Cabeçalho do padrão Chess-Results não encontrado.');

  const headers = asStr[headerIdx];
  const numIdx  = colIndex(headers, ['nº.', 'nº', 'no.', 'no', 'num', 'numero']);
  const nameIdx = colIndex(headers, ['nome']);
  const fideIdx = colIndex(headers, ['id fide']);
  const fedIdx  = colIndex(headers, ['fed']);
  const eloIdx  = colIndex(headers, ['elo']);
  const typeIdx = colIndex(headers, ['tipo']);
  const cityIdx = colIndex(headers, ['clube/cidade', 'clube / cidade', 'clube cidade']);

  if (nameIdx < 0) throw new Error('Coluna "Nome" não encontrada.');

  const participants: ImportedParticipant[] = [];
  for (const row of asStr.slice(headerIdx + 1)) {
    const rawName = row[nameIdx] ?? '';
    const fullName = rawName.includes(',')
      ? rawName.split(',').map((s: string) => s.trim()).filter(Boolean).reverse().join(' ')
      : rawName;
    if (!fullName) continue;
    if (normalize(fullName).startsWith('encontrara todos os detalhes')) break;
    if (normalize(fullName).includes('chess-results')) continue;

    const ratingStd = parseInt(eloIdx >= 0 ? row[eloIdx] : '', 10);
    const initialRanking = parseInt(numIdx >= 0 ? row[numIdx] : '', 10);

    participants.push({
      fullName,
      fideId: fideIdx >= 0 ? row[fideIdx] || undefined : undefined,
      federation: fedIdx >= 0 ? row[fedIdx] || undefined : undefined,
      ratingStd: Number.isFinite(ratingStd) && ratingStd > 0 ? ratingStd : undefined,
      initialRanking: Number.isFinite(initialRanking) && initialRanking > 0 ? initialRanking : undefined,
      category: typeIdx >= 0 ? row[typeIdx] || undefined : undefined,
      city: cityIdx >= 0 ? row[cityIdx] || undefined : undefined,
    });
  }

  if (!participants.length) throw new Error('Nenhum participante válido encontrado.');
  return participants;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { url } = await request.json();
  if (!url || typeof url !== 'string') return NextResponse.json({ error: 'URL inválida.' }, { status: 400 });

  // Fetch the Excel file server-side (avoids CORS)
  let fileBuffer: ArrayBuffer;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fileBuffer = await res.arrayBuffer();
  } catch (err) {
    return NextResponse.json({ error: `Erro ao baixar o arquivo: ${(err as Error).message}` }, { status: 422 });
  }

  // Parse Excel
  let participants: ImportedParticipant[];
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
    participants = parseRows(rawRows);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  // Get tournament
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, created_by')
    .eq('slug', slug)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });
  if (tournament.created_by !== user.id) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  // Existing tournament player IDs (to detect duplicates)
  const { data: existingTPs } = await supabase
    .from('tournament_players')
    .select('player_id')
    .eq('tournament_id', tournament.id);
  const existingPlayerIds = new Set((existingTPs ?? []).map((tp) => tp.player_id));

  // Category map
  const { data: categoryRows } = await supabase
    .from('tournament_categories')
    .select('id, name')
    .eq('tournament_id', tournament.id);
  const categoryMap = new Map<string, string>((categoryRows ?? []).map((r) => [normalize(r.name), r.id]));

  let added = 0, created = 0, reused = 0, skipped = 0, failed = 0;

  for (const p of participants) {
    try {
      let playerId: string | null = null;
      let categoryId: string | undefined;

      // Resolve category
      if (p.category) {
        const normCat = normalize(p.category);
        if (categoryMap.has(normCat)) {
          categoryId = categoryMap.get(normCat);
        } else {
          const { data: created } = await supabase
            .from('tournament_categories')
            .insert({ tournament_id: tournament.id, name: p.category })
            .select('id, name')
            .single();
          if (created) { categoryMap.set(normCat, created.id); categoryId = created.id; }
        }
      }

      // Find player by FIDE ID
      if (p.fideId) {
        const { data: match } = await supabase
          .from('players').select('id').eq('fide_id', p.fideId).limit(1).maybeSingle();
        if (match?.id) {
          playerId = match.id;
          reused++;
          if (p.city || p.ratingStd || p.federation) {
            await supabase.from('players').update({
              city: p.city, rating_std: p.ratingStd, federation: p.federation,
            }).eq('id', match.id);
          }
        }
      }

      // Find player by name
      if (!playerId) {
        const { data: matches } = await supabase
          .from('players').select('id, full_name').ilike('full_name', p.fullName).limit(10);
        const exact = matches?.find((m) => normalize(m.full_name) === normalize(p.fullName));
        if (exact) {
          playerId = exact.id;
          reused++;
          if (p.fideId || p.city || p.ratingStd) {
            await supabase.from('players').update({
              fide_id: p.fideId, city: p.city, rating_std: p.ratingStd, federation: p.federation,
            }).eq('id', exact.id);
          }
        }
      }

      // Create player
      if (!playerId) {
        const { data: np } = await supabase
          .from('players')
          .insert({ full_name: p.fullName, fide_id: p.fideId, federation: p.federation ?? 'BRA', rating_std: p.ratingStd, city: p.city })
          .select('id').single();
        if (np) { playerId = np.id; created++; }
      }

      if (!playerId) { failed++; continue; }
      if (existingPlayerIds.has(playerId)) { skipped++; continue; }

      await supabase.from('tournament_players').insert({
        tournament_id: tournament.id,
        player_id: playerId,
        initial_ranking: p.initialRanking,
        category_id: categoryId,
      });

      existingPlayerIds.add(playerId);
      added++;
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.includes('duplicate key') || msg.includes('unique')) skipped++;
      else failed++;
    }
  }

  return NextResponse.json({ added, created, reused, skipped, failed, total: participants.length });
}
