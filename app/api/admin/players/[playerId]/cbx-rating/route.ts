import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@/lib/supabase/server';

const UA = 'Mozilla/5.0 (compatible; chess-viewer-admin)';
const CACHE_DAYS = 30;

interface CbxRatingResult {
  ratingStd: number | null;
  ratingRpd: number | null;
  ratingBlz: number | null;
  checkedAt: string;
  fromCache: boolean;
  playerName: string | null;
}

/**
 * Busca o rating de um jogador direto no perfil dele na CBX — não pelo
 * formulário de busca (cbx.org.br/rating), que é um único <form method=post>
 * ASP.NET WebForms por página inteira, com __VIEWSTATE, bem mais frágil de
 * simular. O perfil individual é uma URL GET direta, sem token nenhum:
 * cbx.org.br/jogador/{id}. Confirmado ao vivo em 2026-07: jogador existente
 * tem <div id="dados-jogador-row1"><h2>{nome}</h2>...</div> e uma tabela
 * <table id="ContentPlaceHolder1_gdvRating"> com colunas
 * Mês/Ano | Clássico | Rápido | Blitz — a primeira linha de dados é a mais
 * recente. Jogador inexistente: mesma página, sem #dados-jogador-row1.
 */
async function fetchCbxRating(cbxId: string): Promise<{ playerName: string | null; ratingStd: number | null; ratingRpd: number | null; ratingBlz: number | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let html: string;
  try {
    const res = await fetch(`https://cbx.org.br/jogador/${encodeURIComponent(cbxId)}`, {
      headers: { 'User-Agent': UA },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const $ = cheerio.load(html);
  const playerName = $('#dados-jogador-row1 h2').first().text().trim();
  if (!playerName) return null; // ID não encontrado na CBX

  const firstDataRow = $('table#ContentPlaceHolder1_gdvRating tbody tr').eq(1); // eq(0) é o cabeçalho
  const cells = firstDataRow.find('td');
  const parseCell = (i: number): number | null => {
    const raw = cells.eq(i).text().trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };

  return {
    playerName,
    ratingStd: parseCell(1),
    ratingRpd: parseCell(2),
    ratingBlz: parseCell(3),
  };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('cbx_id, cbx_rating_checked_at, rating_std, rating_rpd, rating_blz, full_name')
    .eq('id', playerId)
    .single();
  if (fetchError) return NextResponse.json({ error: `Erro ao buscar jogador: ${fetchError.message}` }, { status: 500 });
  if (!player) return NextResponse.json({ error: 'Jogador não encontrado.' }, { status: 404 });
  if (!player.cbx_id) return NextResponse.json({ error: 'Jogador sem ID CBX cadastrado.' }, { status: 400 });

  // Cache: só reconsulta a CBX depois de 30 dias — pedido explícito de não
  // bater no site deles toda hora, e clicar de novo no mesmo mês deve só
  // devolver o que já está salvo.
  if (player.cbx_rating_checked_at) {
    const ageMs = Date.now() - new Date(player.cbx_rating_checked_at).getTime();
    if (ageMs < CACHE_DAYS * 24 * 60 * 60 * 1000) {
      const result: CbxRatingResult = {
        ratingStd: player.rating_std,
        ratingRpd: player.rating_rpd,
        ratingBlz: player.rating_blz,
        checkedAt: player.cbx_rating_checked_at,
        fromCache: true,
        playerName: player.full_name,
      };
      return NextResponse.json(result);
    }
  }

  let cbx: Awaited<ReturnType<typeof fetchCbxRating>>;
  try {
    cbx = await fetchCbxRating(player.cbx_id);
  } catch (err) {
    const msg = (err as Error).name === 'AbortError'
      ? 'Tempo limite excedido ao conectar na CBX (10s).'
      : `Erro ao consultar a CBX: ${(err as Error).message}`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }
  if (!cbx) {
    return NextResponse.json({ error: `ID CBX ${player.cbx_id} não encontrado no site da CBX.` }, { status: 404 });
  }

  const checkedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('players')
    .update({
      rating_std: cbx.ratingStd,
      rating_rpd: cbx.ratingRpd,
      rating_blz: cbx.ratingBlz,
      cbx_rating_checked_at: checkedAt,
    })
    .eq('id', playerId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 403 });

  const result: CbxRatingResult = {
    ratingStd: cbx.ratingStd,
    ratingRpd: cbx.ratingRpd,
    ratingBlz: cbx.ratingBlz,
    checkedAt,
    fromCache: false,
    playerName: cbx.playerName,
  };
  return NextResponse.json(result);
}
