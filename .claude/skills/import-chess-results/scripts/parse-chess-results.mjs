#!/usr/bin/env node
// Fetch + parse chess-results.com pages/planilhas SEM tocar no banco.
// Porta fiel da lógica de ../xadrez-br-cron/src/{chess-results,normalize,import-players,import-pairings,import-standings}.ts
// e de app/api/admin/chess-results-preview/route.ts (este repo) — não reinventa regras de parsing,
// só reimplementa em JS puro (o worker real é TS/supabase-js) pra poder rodar num script standalone.
//
// Uso (rodar com cwd na raiz do repo xadrez-br):
//   node .claude/skills/import-chess-results/scripts/parse-chess-results.mjs info      <baseUrl>
//   node .claude/skills/import-chess-results/scripts/parse-chess-results.mjs players   <baseUrl>
//   node .claude/skills/import-chess-results/scripts/parse-chess-results.mjs rounds    <baseUrl>
//   node .claude/skills/import-chess-results/scripts/parse-chess-results.mjs pairings  <baseUrl> <roundNumber>
//   node .claude/skills/import-chess-results/scripts/parse-chess-results.mjs standings <baseUrl>
//
// Cada subcomando imprime UM JSON em stdout. Erros vão pro stderr com exit code 1.

import { createRequire } from 'module';
import path from 'path';

const UA = 'Mozilla/5.0 (compatible; chess-viewer-admin)';

// ---------------------------------------------------------------------------
// Resolução de dependências: cheerio já é dependência do xadrez-br (usado por
// app/api/admin/chess-results-preview/route.ts); xlsx só existe no repo irmão
// ../xadrez-br-cron (ou ../cron-import, nome antigo citado no CLAUDE.md) — o
// worker de importação real depende dele. Tenta os dois nomes de pasta.
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);

function loadCheerio() {
  return require('cheerio');
}

function loadXlsx() {
  const candidates = ['xadrez-br-cron', 'cron-import'];
  for (const dir of candidates) {
    try {
      return require(path.join(process.cwd(), '..', dir, 'node_modules', 'xlsx'));
    } catch { /* tenta o próximo */ }
  }
  try {
    return require('xlsx');
  } catch {
    throw new Error(
      "Não achei o pacote 'xlsx'. Rode este script com cwd na raiz do repo xadrez-br " +
      "(que tem o repo irmão xadrez-br-cron clonado ao lado com `npm install` já feito), " +
      "ou instale local: npm i xlsx --no-save"
    );
  }
}

// ---------------------------------------------------------------------------
// normalize.ts
// ---------------------------------------------------------------------------
function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeNameKey(value) {
  return normalize(String(value ?? '').replace(/,/g, ' '))
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function colIndex(headers, aliases) {
  const norm = aliases.map(normalize);
  return headers.findIndex((h) => norm.includes(normalize(h)));
}

// ---------------------------------------------------------------------------
// chess-results.ts
// ---------------------------------------------------------------------------
function parseBaseUrl(url) {
  const u = new URL(url);
  const m = u.pathname.match(/tnr(\d+)\.aspx/i);
  if (!m) throw new Error(`URL inválida: esperado caminho tnr<id>.aspx, recebido ${u.pathname}`);
  return { href: u.toString(), tnr: m[1], lan: u.searchParams.get('lan') ?? '10', snode: u.searchParams.get('SNode') };
}

function buildArtUrl(info, art, round) {
  const u = new URL(info.href);
  u.search = '';
  u.searchParams.set('lan', info.lan);
  u.searchParams.set('art', String(art));
  if (round !== undefined) u.searchParams.set('rd', String(round));
  if (info.snode) u.searchParams.set('SNode', info.snode);
  u.searchParams.set('turdet', 'YES');
  return u.toString();
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  return res.text();
}

async function fetchExcelDirect(pageUrl) {
  const u = new URL(pageUrl);
  u.searchParams.set('prt', '4');
  u.searchParams.set('excel', '2010');
  const excelUrl = u.toString();
  const res = await fetch(excelUrl, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar Excel de ${excelUrl}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/html')) throw new Error(`Resposta HTML em vez de Excel para ${excelUrl} (rodada provavelmente ainda não publicada)`);
  return res.arrayBuffer();
}

function extractMaxRound(html) {
  const matches = html.matchAll(/[?&;]rd=(\d+)/g);
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

function extractRoundCountFromHeading(html) {
  const m = html.match(/(?:após|apos|after|nach)\s+(\d+)\s*(?:rondas?|rodadas?|rounds?|runden)/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// app/api/admin/chess-results-preview/route.ts (metadados pro preview)
// ---------------------------------------------------------------------------
const LABELS = {
  name: ['torneio', 'tournament', 'turnier', 'nome do torneio'],
  city: ['cidade', 'city', 'ort', 'local'],
  // 'data' isolado (sem "início"/"fim") é comum em torneio de 1 dia só (ex.:
  // rápido/blitz de fim de semana) — o site nem cria uma coluna "Data Fim".
  // Fica por último pra variantes mais específicas ganharem quando existirem.
  startDate: ['data início', 'data de início', 'início', 'begin', 'start', 'beginn', 'data início:', 'data'],
  endDate: ['data fim', 'fim', 'end', 'ende', 'data término'],
  roundsCount: ['rodadas', 'rounds', 'runden', 'número de rodadas', 'number of rounds'],
  // 'árbitro-chefe' é a variante usada em torneios grandes/federativos;
  // muitos torneios de clube rotulam como "Árbitro Principal" (+ opcional
  // "Árbitro Adjunto", que este parser não captura — só o principal).
  chiefArbiter: ['árbitro-chefe', 'arbitro-chefe', 'árbitro chefe', 'árbitro principal', 'arbitro principal', 'chief arbiter', 'hauptschiedsrichter'],
  organizerName: ['organizador', 'organizer', 'veranstalter'],
  // 'tempo de reflexao' é o rótulo real mais comum em torneios brasileiros
  // (aparece como "Tempo de reflexão (Rapid)" / "(Blitz)" etc. — o sufixo
  // entre parênteses não atrapalha porque normalizeLabel já removeu os
  // parênteses, sobrando só as palavras).
  timeControl: ['ritmo', 'ritmo de jogo', 'tempo de reflexao', 'time control', 'rate of play', 'bedenkzeit'],
};

function normalizeLabel(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function parseDateDDMMYYYY(raw) {
  const m = String(raw ?? '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// A maioria dos torneios usa "dd.mm.yyyy" na coluna Data, mas o formato
// varia por país/idioma do organizador — visto "yyyy/mm/dd" no Tnr1475176
// (torneio brasileiro, campo único "Data" em vez de "Data Início"/"Data
// Fim"). Tenta os dois antes de desistir.
function parseAnyDate(raw) {
  const s = String(raw ?? '').trim();
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const ymd = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return '';
}

async function cmdInfo(baseUrl) {
  const cheerio = loadCheerio();
  const info = parseBaseUrl(baseUrl);
  const infoUrl = buildArtUrl(info, 0);
  const html = await fetchHtml(infoUrl);
  const $ = cheerio.load(html);

  const result = { name: '', city: '', state: '', startDate: '', endDate: '', roundsCount: 0, chiefArbiter: '', organizerName: '', timeControl: '', venue: '' };

  const nameCandidates = [
    $('h2').first().text().trim(),
    $('h3').first().text().trim(),
    $('title').text().replace(/chess-results\.com/i, '').replace(/[|\-–].*$/, '').trim(),
  ];
  result.name = nameCandidates.find((s) => s.length > 3) ?? '';

  const tableData = new Map();
  $('tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length >= 2) {
      const label = normalizeLabel($(cells[0]).text());
      const value = $(cells[1]).text().trim();
      // Chess-results tem uma <tr> "âncora" cuja 1ª célula concatena o texto
      // de TODA a página (link de inscrição + todos os outros rótulos) — sem
      // esse guard ela vira o rótulo "vencedor" de qualquer campo cujo alias
      // apareça em algum lugar do meio dela (ex.: organizerName sempre bate
      // porque "organizador" está lá dentro), mascarando a linha certa que
      // viria depois no mesmo Map. Rótulo de verdade é sempre curto.
      if (label && value && label.length <= 60) tableData.set(label, value);
    }
  });

  for (const [field, variants] of Object.entries(LABELS)) {
    if (field === 'name') continue;
    for (const [label, value] of tableData.entries()) {
      if (variants.some((v) => label.includes(normalizeLabel(v)))) {
        if (field === 'startDate' || field === 'endDate') result[field] = parseAnyDate(value);
        else if (field === 'roundsCount') { const n = parseInt(value, 10); if (!isNaN(n)) result[field] = n; }
        else result[field] = value;
        break;
      }
    }
  }

  // "Local" costuma trazer "ENDEREÇO - CIDADE UF" — não faz parte do LABELS
  // original (que só cobre 'local'->venue bruto); separa cidade/UF quando dá.
  const local = tableData.get('local');
  if (local) {
    result.venue = local;
    const m = local.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,})\s+([A-Z]{2})\s*$/);
    if (m) { result.city = m[1].trim(); result.state = m[2]; }
  }

  if (!result.startDate) {
    // Fallback pra layout sem <td> paritário reconhecível — texto corrido.
    const bodyText = $('body').text();
    const m = bodyText.match(/(?:DATA[:\s]+)(\d{1,2}[./]\d{1,2}[./]\d{4})/i) ?? bodyText.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (m) result.startDate = parseDateDDMMYYYY(m[1].replace(/\//g, '.'));
  }

  return result;
}

// ---------------------------------------------------------------------------
// import-players.ts — parseRows
// ---------------------------------------------------------------------------
function parsePlayerRows(rawRows) {
  const asStr = rawRows.map((row) => row.map((c) => String(c ?? '').trim()));
  const headerIdx = asStr.findIndex((row) => row.some((c) => normalize(c) === 'nome'));
  if (headerIdx < 0) throw new Error('Cabeçalho do padrão Chess-Results não encontrado (coluna "Nome" ausente).');

  const headers = asStr[headerIdx];
  const numIdx = colIndex(headers, ['nº.', 'nº', 'no.', 'no', 'num', 'numero']);
  const nameIdx = colIndex(headers, ['nome']);
  const fideIdx = colIndex(headers, ['id fide']);
  const fedIdx = colIndex(headers, ['fed']);
  const eloIdx = colIndex(headers, ['elo', 'elon', 'elof', 'rtg', 'rating']);
  const typeIdx = colIndex(headers, ['tipo']);
  const cityIdx = colIndex(headers, ['clube/cidade', 'clube / cidade', 'clube cidade']);
  if (nameIdx < 0) throw new Error('Coluna "Nome" não encontrada.');

  const out = [];
  for (const row of asStr.slice(headerIdx + 1)) {
    const rawName = row[nameIdx] ?? '';
    const fullName = rawName.includes(',') ? rawName.split(',').map((s) => s.trim()).filter(Boolean).reverse().join(' ') : rawName;
    if (!fullName) continue;
    if (normalize(fullName).startsWith('encontrara todos os detalhes')) break;
    if (normalize(fullName).includes('chess-results')) continue;

    const ratingStd = parseInt(eloIdx >= 0 ? row[eloIdx] : '', 10);
    const initialRanking = parseInt(numIdx >= 0 ? row[numIdx] : '', 10);

    out.push({
      fullName,
      fideId: fideIdx >= 0 ? (row[fideIdx] || undefined) : undefined,
      federation: fedIdx >= 0 ? (row[fedIdx] || undefined) : undefined,
      ratingStd: Number.isFinite(ratingStd) && ratingStd > 0 ? ratingStd : undefined,
      initialRanking: Number.isFinite(initialRanking) && initialRanking > 0 ? initialRanking : undefined,
      category: typeIdx >= 0 ? (row[typeIdx] || undefined) : undefined,
      city: cityIdx >= 0 ? (row[cityIdx] || undefined) : undefined,
    });
  }
  return out;
}

async function cmdPlayers(baseUrl) {
  const XLSX = loadXlsx();
  const info = parseBaseUrl(baseUrl);
  const buf = await fetchExcelDirect(buildArtUrl(info, 0));
  const workbook = XLSX.read(buf, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  return parsePlayerRows(rawRows);
}

// ---------------------------------------------------------------------------
// process-tournament.ts — descoberta de rounds
// ---------------------------------------------------------------------------
async function cmdRounds(baseUrl) {
  const info = parseBaseUrl(baseUrl);
  const [standingsHtml, pairingsIndexHtml] = await Promise.all([
    fetchHtml(buildArtUrl(info, 1)),
    fetchHtml(buildArtUrl(info, 2)),
  ]);
  let maxRound = Math.max(extractMaxRound(standingsHtml), extractMaxRound(pairingsIndexHtml));
  if (maxRound === 0) {
    maxRound = Math.max(extractRoundCountFromHeading(standingsHtml), extractRoundCountFromHeading(pairingsIndexHtml));
  }
  return { maxRound };
}

// ---------------------------------------------------------------------------
// import-pairings.ts — parseExcel
// ---------------------------------------------------------------------------
function parseResult(raw) {
  const s = String(raw ?? '').trim();
  if (s === '1 - 0') return { result: '1-0', whitePoints: 1.0, blackPoints: 0.0 };
  if (s === '0 - 1') return { result: '0-1', whitePoints: 0.0, blackPoints: 1.0 };
  if (s.includes('½') || s.includes('1/2')) return { result: '1/2-1/2', whitePoints: 0.5, blackPoints: 0.5 };
  const wo = s.replace(/\s+/g, '');
  if (wo === '--+') return { result: 'forfeit_white', whitePoints: 0, blackPoints: 1 };
  if (wo === '+--') return { result: 'forfeit_black', whitePoints: 1, blackPoints: 0 };
  if (wo === '---') return { result: 'double_forfeit', whitePoints: 0, blackPoints: 0 };
  return { result: '*', whitePoints: null, blackPoints: null };
}

function parsePairingsExcel(buf, XLSX) {
  const workbook = XLSX.read(buf, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let roundNumber = 0;
  for (let i = 0; i < Math.min(30, raw.length); i++) {
    const cell = String(raw[i]?.[0] ?? '').trim();
    const m = cell.match(/^(\d+)\.\s*Ronda/i) ?? cell.match(/Ronda\s+(\d+)/i) ?? cell.match(/Round\s+(\d+)/i);
    if (m) { roundNumber = parseInt(m[1], 10); break; }
  }
  if (!roundNumber) throw new Error('Número da rodada não encontrado.');

  let dataStart = -1, whiteNameIdx = 1, resultIdx = -1, blackNameIdx = -1, whiteNoIdx = -1, blackNoIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const cells = row.map((c) => String(c ?? '').trim());
    const rIdx = cells.findIndex((c) => c === 'Resultado' || /^Result/i.test(c));
    if (rIdx < 0) continue;
    resultIdx = rIdx;
    const wIdx = cells.findIndex((c) => c === 'White');
    const bIdx = cells.findIndex((c) => c === 'Black');
    if (wIdx >= 0) whiteNameIdx = wIdx;
    blackNameIdx = bIdx >= 0 ? bIdx : rIdx + 2;
    const noIdxs = cells.map((c, idx) => (/^n[ºo°]?\.?$/i.test(c) ? idx : -1)).filter((idx) => idx >= 0);
    if (noIdxs.length >= 2) { whiteNoIdx = noIdxs[0]; blackNoIdx = noIdxs[noIdxs.length - 1]; }
    dataStart = i + 1;
    break;
  }
  if (dataStart === -1) throw new Error('Coluna "Resultado" não encontrada.');

  const pairings = [];
  for (let i = dataStart; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row[0] == null) continue;
    const board = Number(row[0]);
    if (isNaN(board) || board <= 0) continue;
    const whiteName = String(row[whiteNameIdx] ?? '').trim();
    if (!whiteName) continue;
    const num = (idx) => { if (idx < 0) return null; const n = Number(String(row[idx] ?? '').trim()); return Number.isFinite(n) && n > 0 ? n : null; };
    const whiteNo = num(whiteNoIdx), blackNo = num(blackNoIdx);
    const rawBlack = String(row[blackNameIdx] ?? '').trim();
    const blackLower = rawBlack.toLowerCase();
    const isBye = blackLower === 'bye' || blackLower === 'não emparceirado' || rawBlack === '';
    if (isBye) {
      const points = Number(row[resultIdx]);
      pairings.push({ board, whiteName, blackName: null, result: 'bye', whitePoints: Number.isFinite(points) && points > 0 ? points : 1.0, blackPoints: null, isBye: true, whiteNo, blackNo });
    } else {
      const { result, whitePoints, blackPoints } = parseResult(row[resultIdx]);
      pairings.push({ board, whiteName, blackName: rawBlack, result, whitePoints, blackPoints, isBye: false, whiteNo, blackNo });
    }
  }
  return { roundNumber, pairings };
}

async function cmdPairings(baseUrl, roundArg) {
  const XLSX = loadXlsx();
  const info = parseBaseUrl(baseUrl);
  const round = parseInt(roundArg, 10);
  if (!round) throw new Error('Informe o número da rodada: pairings <baseUrl> <roundNumber>');
  const buf = await fetchExcelDirect(buildArtUrl(info, 2, round));
  return parsePairingsExcel(buf, XLSX);
}

// ---------------------------------------------------------------------------
// import-standings.ts — parseExcel
// ---------------------------------------------------------------------------
function parseStandingsExcel(buf, XLSX) {
  const workbook = XLSX.read(buf, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let completedRound = null;
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const cell = String(raw[i]?.[0] ?? '');
    const m = cell.match(/ronda\s+(\d+)|round\s+(\d+)/i);
    if (m) { completedRound = parseInt(m[1] ?? m[2], 10); break; }
  }

  let headerIdx = -1, headerCells = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (row?.some((cell) => String(cell ?? '').trim() === 'Nome')) { headerIdx = i; headerCells = row.map((c) => String(c ?? '').trim()); break; }
  }
  if (headerIdx === -1) throw new Error('Coluna "Nome" não encontrada.');

  const colNr = headerCells.findIndex((h) => /^n[rº°]/i.test(h) && !/^nome/i.test(h));
  const colPts = headerCells.findIndex((h) => /^pts\.?\s*$/i.test(h) || /^pontos$/i.test(h) || /^punkte$/i.test(h));
  const colName = headerCells.findIndex((h) => /^nome$/i.test(h) || /^name$/i.test(h));
  const tbCols = headerCells.map((h, i) => ({ h, i })).filter(({ h }) => /^(des|tb|dp)/i.test(h) && /\d/.test(h)).sort((a, b) => a.i - b.i).map(({ i }) => i);
  if (colPts === -1) throw new Error('Coluna de pontos não encontrada no cabeçalho.');

  const rows = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row[0] == null) continue;
    const rank = Number(row[0]);
    if (isNaN(rank) || rank <= 0) continue;
    rows.push({
      rank,
      initialRanking: colNr >= 0 ? Number(row[colNr]) || 0 : Number(row[1]) || 0,
      name: String(row[colName >= 0 ? colName : 3] ?? '').trim(),
      points: Number(row[colPts]) || 0,
      buchholz: tbCols[0] !== undefined ? Number(row[tbCols[0]]) || 0 : 0,
      buchholzCut1: tbCols[1] !== undefined ? Number(row[tbCols[1]]) || 0 : 0,
      sonnebornBerger: tbCols[2] !== undefined ? Number(row[tbCols[2]]) || 0 : 0,
    });
  }
  return { rows, completedRound };
}

async function cmdStandings(baseUrl) {
  const XLSX = loadXlsx();
  const info = parseBaseUrl(baseUrl);
  const buf = await fetchExcelDirect(buildArtUrl(info, 1));
  return parseStandingsExcel(buf, XLSX);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const [, , cmd, baseUrl, extra] = process.argv;
  if (!cmd || !baseUrl) {
    console.error('Uso: parse-chess-results.mjs <info|players|rounds|pairings|standings> <baseUrl> [roundNumber]');
    process.exit(1);
  }
  let out;
  switch (cmd) {
    case 'info': out = await cmdInfo(baseUrl); break;
    case 'players': out = await cmdPlayers(baseUrl); break;
    case 'rounds': out = await cmdRounds(baseUrl); break;
    case 'pairings': out = await cmdPairings(baseUrl, extra); break;
    case 'standings': out = await cmdStandings(baseUrl); break;
    default:
      console.error(`Subcomando desconhecido: ${cmd}`);
      process.exit(1);
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
