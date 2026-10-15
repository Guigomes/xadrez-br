// Fonte de importação alternativa: info64.org (plataforma usada pela FIDE/FEDA no Mundial
// U7–U17 2026, que NÃO publica no chess-results.com).
//
// Estratégia: em vez de reescrever a lógica de gravação, este módulo converte as páginas HTML
// do info64 nas MESMAS planilhas (xlsx, rótulos do chess-results) que o worker `cron-import`
// já sabe ler, e entrega os buffers para `importPlayers`/`importPairings`/`importStandings`
// do worker. Assim herdamos, sem duplicar, o casamento de jogadores por nome/FIDE, a
// idempotência, o fechamento de rodadas e a contagem de jogos.
//
// Autônomo de propósito: não importa nada do worker. As três funções de gravação entram por
// injeção (`Importers`), então o mesmo arquivo serve ao CLI (`import-info64.ts`) e, depois,
// ao worker (`processInfo64Import` tem a mesma assinatura de `processImport`).
import * as cheerio from 'cheerio';
import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';

// O info64 devolve 403 para o User-Agent padrão do curl/Node, mas aceita este (o mesmo do worker).
const UA = 'Mozilla/5.0 (compatible; chess-viewer-cron-import)';
const FETCH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

export interface Info64Url {
  /** https://info64.org */
  origin: string;
  /** "fide-world-championship-2026-o7" */
  slug: string;
  /** URL canônica da categoria (a que fica em tournament_imports.base_url). */
  baseUrl: string;
  /** "O7", "G11"... (sufixo do slug, em maiúsculas) */
  category: string;
}

export function isInfo64Url(url: string): boolean {
  try {
    return /(^|\.)info64\.org$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function parseInfo64Url(url: string): Info64Url {
  const u = new URL(url);
  if (!isInfo64Url(url)) throw new Error(`URL não é do info64.org: ${url}`);
  const slug = u.pathname.split('/').filter(Boolean)[0];
  const m = slug?.match(/-([og]\d{1,2})$/i);
  if (!slug || !m) {
    throw new Error(`URL inválida: esperado /<torneio>-<categoria> (ex.: fide-world-championship-2026-o7), recebido ${u.pathname}`);
  }
  return { origin: u.origin, slug, baseUrl: `${u.origin}/${slug}`, category: m[1].toUpperCase() };
}

/** "O7" → "U7 Open", "G11" → "U11 Girls". Nome do grupo de emparceiramento no chess-viewer. */
export function categoryGroupName(category: string): string {
  const m = category.match(/^([OG])(\d+)$/i);
  if (!m) return category;
  return `U${m[2]} ${m[1].toUpperCase() === 'O' ? 'Open' : 'Girls'}`;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchInfo64Html(url: string, attempts = 3): Promise<string> {
  let lastError: Error | null = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) return await res.text();
      // 4xx (exceto 429) não melhora tentando de novo
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
      lastError = new Error(`HTTP ${res.status} ao buscar ${url}`);
    } catch (err) {
      lastError = err as Error;
      if (/HTTP 4\d\d/.test(lastError.message) && !/HTTP 429/.test(lastError.message)) throw lastError;
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i));
  }
  throw lastError ?? new Error(`falha ao buscar ${url}`);
}

// ---------------------------------------------------------------------------
// Parsers (HTML → estruturas)
// ---------------------------------------------------------------------------

const clean = (s: string | undefined | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

export interface Info64Meta {
  /** "FIDE World Championship 2026" (sem o sufixo da categoria) */
  tournamentName: string;
  city: string | null;
  startDate: string | null;
  endDate: string | null;
  chiefArbiter: string | null;
  timeControl: string | null;
  /** Total de rodadas anunciadas (links de rodada no menu). */
  roundsCount: number;
}

export function parseMeta(html: string, category: string): Info64Meta {
  const $ = cheerio.load(html);
  const h1 = clean($('#tournament-menu h1').first().text());
  const suffix = new RegExp(`\\s*-\\s*${category}\\s*$`, 'i');
  const dates = $('#dates .mommentdate')
    .map((_, el) => clean($(el).text()))
    .get();
  const place = clean($('#dates').first().clone().children().remove().end().text()); // "Roquetas de Mar, Spain, from  to"
  const city = place.replace(/,?\s*from\s*to\s*$/i, '').split(',')[0]?.trim() || null;

  // "IA Nikolopoulos, Panagiotis (4226070, GRE)" → "Nikolopoulos, Panagiotis"
  const arbiterRaw = clean($('.arbiter.chief').first().text());
  const chiefArbiter = arbiterRaw
    ? arbiterRaw.replace(/\s*\([^)]*\)\s*$/, '').replace(/^(IA|FA|NA|IO|FI|NI)\s+/i, '') || null
    : null;

  const roundNumbers = new Set<number>();
  $('a[href]').each((_, el) => {
    const m = ($(el).attr('href') ?? '').match(/-[og]\d{1,2}\/(\d+)$/i);
    if (m) roundNumbers.add(Number(m[1]));
  });

  return {
    tournamentName: h1.replace(suffix, '') || h1,
    city,
    startDate: dates[0] ?? null,
    endDate: dates[1] ?? null,
    chiefArbiter,
    timeControl: clean($('.rateofplay').first().text()) || null,
    roundsCount: roundNumbers.size ? Math.max(...roundNumbers) : 0,
  };
}

export interface Info64Player {
  rank: number;
  title: string;
  name: string;
  federation: string;
  rating: number;
  fideId: string;
}

export function parsePlayers(html: string): Info64Player[] {
  const $ = cheerio.load(html);
  const out: Info64Player[] = [];
  $('#initial-ranking-table tbody tr').each((_, tr) => {
    const row = $(tr);
    const rank = parseInt(clean(row.find('td.playerstartrank').first().text()), 10);
    const name = clean(row.find('td.playername').text());
    if (!Number.isFinite(rank) || !name) return;
    out.push({
      rank,
      title: clean(row.find('td.playertitle').text()),
      name,
      federation: clean(row.find('td.playerfederation').text()),
      rating: parseInt(clean(row.find('td.playerfiderat').text()), 10) || 0,
      fideId: clean(row.find('td.playerfideratid').text()).replace(/\D/g, ''),
    });
  });
  return out;
}

export interface Info64Pairing {
  board: number;
  whiteName: string;
  whiteNo: number | null;
  /** null = sem adversário (bye / não emparceirado) */
  blackName: string | null;
  blackNo: number | null;
  /** Texto cru da célula de resultado: "1-0", "0-1", "½-½", "+", "0", "" ... */
  result: string;
}

export function parsePairings(html: string): { roundNumber: number | null; date: string | null; pairings: Info64Pairing[] } {
  const $ = cheerio.load(html);
  const heading = clean($('#round h2').first().text());
  const roundNumber = parseInt(heading.match(/round\s+(\d+)/i)?.[1] ?? '', 10);
  const date = clean($('#round h2 .mommentdate').first().text()) || null;

  const pairings: Info64Pairing[] = [];
  $('#pairing-table tbody tr').each((_, tr) => {
    const cells = $(tr)
      .find('td')
      .map((__, td) => clean($(td).text()))
      .get();
    const board = parseInt(cells[0], 10);
    if (!Number.isFinite(board) || !cells[1]) return;
    const no = (i: number): number | null => {
      const n = parseInt(cells[i] ?? '', 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const blackName = cells[7] ? cells[7] : null;
    pairings.push({
      board,
      whiteName: cells[1],
      whiteNo: no(2),
      blackName,
      blackNo: blackName ? no(8) : null,
      result: cells[6] ?? '',
    });
  });
  return { roundNumber: Number.isFinite(roundNumber) ? roundNumber : null, date, pairings };
}

export interface Info64Standing {
  pos: number;
  rank: number;
  name: string;
  federation: string;
  points: number;
  /** Desempates como o worker os grava: tb1=Buchholz, tb2=Buchholz corte 1, tb3=Sonneborn-Berger. */
  bh: number;
  bhCut1: number;
  sb: number;
}

export function parseStandings(html: string): { afterRound: number | null; rows: Info64Standing[] } {
  const $ = cheerio.load(html);
  const afterRound = parseInt(clean($('#standings h2').first().text()).match(/round\s+(\d+)/i)?.[1] ?? '', 10);

  const headers = $('#standings-table thead th')
    .map((_, th) => clean($(th).text()))
    .get();
  const idx = (re: RegExp): number => headers.findIndex((h) => re.test(h));
  const cPos = idx(/^pos/i);
  const cRank = idx(/^ran/i);
  const cName = idx(/^name/i);
  const cFed = idx(/^fed/i);
  const cPts = idx(/^pts/i);
  const cBh = headers.findIndex((h) => /^BH$/i.test(h));
  const cBhCut = headers.findIndex((h) => /^BH\/C1$/i.test(h));
  const cSb = headers.findIndex((h) => /^SB$/i.test(h));
  if (cName < 0 || cPts < 0) throw new Error(`Cabeçalho de classificação inesperado: ${headers.join(' | ')}`);

  const num = (cells: string[], i: number): number => (i < 0 ? 0 : Number(cells[i]?.replace(',', '.')) || 0);
  const rows: Info64Standing[] = [];
  $('#standings-table tbody tr').each((_, tr) => {
    const cells = $(tr)
      .find('td')
      .map((__, td) => clean($(td).text()))
      .get();
    const pos = parseInt(cells[cPos < 0 ? 0 : cPos], 10);
    if (!Number.isFinite(pos) || !cells[cName]) return;
    rows.push({
      pos,
      rank: num(cells, cRank),
      name: cells[cName],
      federation: cFed >= 0 ? cells[cFed] : '',
      points: num(cells, cPts),
      bh: num(cells, cBh),
      bhCut1: num(cells, cBhCut),
      sb: num(cells, cSb),
    });
  });
  return { afterRound: Number.isFinite(afterRound) ? afterRound : null, rows };
}

// ---------------------------------------------------------------------------
// Builders (estruturas → planilha no formato do chess-results que o worker lê)
// ---------------------------------------------------------------------------

function toBuffer(rows: (string | number)[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** `sex`: 'w' para categorias Girls (a lista do info64 não traz a coluna). */
export function buildPlayersWorkbook(players: Info64Player[], sex: 'w' | null): ArrayBuffer {
  const rows: (string | number)[][] = [
    ['Starting rank'],
    [],
    // A coluna em branco antes de "Nome" é onde o worker espera o título (CM, WGM...).
    ['Nº.', '', 'Nome', 'Fed', 'Elo', 'ID FIDE', 'sexo'],
  ];
  for (const p of players) {
    rows.push([p.rank, p.title, p.name, p.federation, p.rating > 0 ? p.rating : '', p.fideId, sex ?? '']);
  }
  return toBuffer(rows);
}

/** Resultado de partida → célula no estilo do chess-results (o parser do worker é por texto). */
export function resultCell(raw: string): string {
  const s = raw.replace(/[\s:]/g, '');
  if (s === '1-0') return '1 - 0';
  if (s === '0-1') return '0 - 1';
  if (s === '½-½' || s === '1/2-1/2' || s === '0.5-0.5') return '½ - ½';
  // W.O.: o worker usa "- - +" (brancas ausentes) / "+ - -" (pretas ausentes) / "- - -"
  if (s === '+-' || s === '+--') return '+ - -';
  if (s === '-+' || s === '--+') return '- - +';
  if (s === '--' || s === '---') return '- - -';
  return ''; // ainda sem resultado → '*'
}

function byeCells(raw: string): { black: string; points: string } {
  const s = raw.trim();
  if (s === '+' || s === '1') return { black: 'bye', points: '1' };
  if (s === '½' || s === '0.5') return { black: 'bye', points: '½' };
  // "0" ou vazio: jogador fora desta rodada (aba "Unpaired players" do info64)
  return { black: 'Não emparceirado', points: '0' };
}

export function buildPairingsWorkbook(roundNumber: number, pairings: Info64Pairing[]): ArrayBuffer {
  const rows: (string | number)[][] = [
    [`Round ${roundNumber}`],
    [],
    ['Brd.', 'White', 'Nº.', 'Pts.', 'Elo', 'Fed', 'Resultado', 'Black', 'Nº.', 'Pts.', 'Elo', 'Fed'],
  ];
  for (const p of pairings) {
    if (!p.blackName) {
      const b = byeCells(p.result);
      rows.push([p.board, p.whiteName, p.whiteNo ?? '', '', '', '', b.points, b.black, '', '', '', '']);
    } else {
      rows.push([p.board, p.whiteName, p.whiteNo ?? '', '', '', '', resultCell(p.result), p.blackName, p.blackNo ?? '', '', '', '']);
    }
  }
  return toBuffer(rows);
}

export function buildStandingsWorkbook(afterRound: number | null, standings: Info64Standing[]): ArrayBuffer {
  const rows: (string | number)[][] = [
    [afterRound ? `Standings after round ${afterRound}` : 'Standings'],
    [],
    ['Pos.', 'Nº.', '', 'Nome', 'Fed', 'Pts.', 'Desp1', 'Desp2', 'Desp3'],
  ];
  for (const s of standings) {
    rows.push([s.pos, s.rank, '', s.name, s.federation, s.points, s.bh, s.bhCut1, s.sb]);
  }
  return toBuffer(rows);
}

// ---------------------------------------------------------------------------
// Orquestração (mesma assinatura de processImport do worker)
// ---------------------------------------------------------------------------

export interface Info64ImportRow {
  id: string;
  tournament_id: string;
  base_url: string;
  pairing_group_name: string | null;
}

/** As três funções de gravação do worker (src/import-*.ts), injetadas pelo chamador. */
export interface Importers {
  importPlayers(
    supabase: SupabaseClient,
    tournamentId: string,
    buffer: ArrayBuffer,
    pairingGroupId: string | null,
    repairGroups?: boolean,
  ): Promise<{ added: number; reused: number; created: number; removed: number; notRemoved: number; homonyms: number; collided: number; failed: number }>;
  importPairings(
    supabase: SupabaseClient,
    tournamentId: string,
    buffer: ArrayBuffer,
    pairingGroupId: string | null,
  ): Promise<{ imported: number; unmatched: number }>;
  importStandings(
    supabase: SupabaseClient,
    tournamentId: string,
    buffer: ArrayBuffer,
    pairingGroupId: string | null,
  ): Promise<{ matched: number; unmatched: number }>;
}

async function resolvePairingGroupId(supabase: SupabaseClient, tournamentId: string, groupName: string | null): Promise<string | null> {
  const name = groupName?.trim();
  if (!name) return null;
  const { data: existing } = await supabase
    .from('pairing_groups')
    .select('id')
    .eq('tournament_id', tournamentId)
    .ilike('name', name)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: groups } = await supabase.from('pairing_groups').select('id').eq('tournament_id', tournamentId);
  const { data: created, error } = await supabase
    .from('pairing_groups')
    .insert({ tournament_id: tournamentId, name, sort_order: groups?.length ?? 0 })
    .select('id')
    .single();
  if (error || !created) throw new Error(`não foi possível criar o grupo "${name}": ${error?.message ?? 'sem retorno'}`);
  return created.id as string;
}

export async function processInfo64Import(
  supabase: SupabaseClient,
  row: Info64ImportRow,
  importers: Importers,
): Promise<string> {
  // Mesma trava do worker: torneio nativo é gerenciado pela engine, nunca por import.
  const { data: tournament } = await supabase.from('tournaments').select('mode').eq('id', row.tournament_id).single();
  if (tournament?.mode === 'native') {
    throw new Error('torneio nativo — importação bloqueada (desabilite esta linha de import)');
  }

  const info = parseInfo64Url(row.base_url);
  const pairingGroupId = await resolvePairingGroupId(supabase, row.tournament_id, row.pairing_group_name);
  const sex = info.category.startsWith('G') ? 'w' : null;

  // 1. Jogadores (lista inicial)
  const indexHtml = await fetchInfo64Html(info.baseUrl);
  const players = parsePlayers(indexHtml);
  if (players.length === 0) throw new Error('lista de jogadores vazia no info64');
  const playersResult = await importers.importPlayers(supabase, row.tournament_id, buildPlayersWorkbook(players, sex), pairingGroupId, true);

  // 2. Rodadas: o menu lista as 11, mas só as publicadas têm mesas. Para na primeira vazia.
  const meta = parseMeta(indexHtml, info.category);
  let publishedRounds = 0;
  let totalPairings = 0;
  let unmatched = 0;
  for (let rd = 1; rd <= (meta.roundsCount || 99); rd++) {
    const html = await fetchInfo64Html(`${info.baseUrl}/${rd}`);
    const parsed = parsePairings(html);
    if (parsed.pairings.length === 0) break;
    publishedRounds = rd;
    const r = await importers.importPairings(supabase, row.tournament_id, buildPairingsWorkbook(rd, parsed.pairings), pairingGroupId);
    totalPairings += r.imported;
    unmatched += r.unmatched;
  }

  await supabase.from('tournament_imports').update({ discovered_rounds_count: publishedRounds }).eq('id', row.id);

  // 3. Classificação (depois das mesas: o importador fecha as rodadas com base nelas)
  const standings = parseStandings(await fetchInfo64Html(`${info.baseUrl}/standings`));
  const standingsResult = await importers.importStandings(
    supabase,
    row.tournament_id,
    buildStandingsWorkbook(standings.afterRound, standings.rows),
    pairingGroupId,
  );

  // Mesmo formato de last_message do worker (a tela /imports lê esse texto)
  const lost = playersResult.collided + playersResult.failed;
  return [
    `jogadores: ${playersResult.added}+${playersResult.reused} (criados ${playersResult.created}${playersResult.removed > 0 ? `, removidos ${playersResult.removed}` : ''}${playersResult.notRemoved > 0 ? `, NÃO REMOVIDOS ${playersResult.notRemoved}` : ''}${playersResult.homonyms > 0 ? `, homônimos ${playersResult.homonyms}` : ''}${lost > 0 ? `, NÃO IMPORTADOS ${lost}` : ''})`,
    `rodadas 1..${publishedRounds}: ${totalPairings} pareamentos${unmatched > 0 ? ` (${unmatched} não identificados)` : ''}`,
    `classificação: ${standingsResult.matched} jogadores`,
    'fonte: info64.org',
  ].join(' · ');
}
