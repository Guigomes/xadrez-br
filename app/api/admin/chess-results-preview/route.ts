import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (compatible; chess-viewer-admin)';

export interface ChessResultsPreview {
  name: string;
  city: string;
  startDate: string;   // YYYY-MM-DD or ''
  endDate: string;     // YYYY-MM-DD or ''
  roundsCount: number; // 0 = not found
  chiefArbiter: string;
  organizerName: string;
  timeControl: string;
}

// Label variants in PT, EN, DE
const LABELS: Record<keyof ChessResultsPreview, string[]> = {
  name:          ['torneio', 'tournament', 'turnier', 'nome do torneio'],
  city:          ['cidade', 'city', 'ort', 'local'],
  startDate:     ['data início', 'data de início', 'início', 'begin', 'start', 'beginn', 'data início:'],
  endDate:       ['data fim', 'fim', 'end', 'ende', 'data término'],
  roundsCount:   ['rodadas', 'rounds', 'runden', 'número de rodadas', 'number of rounds'],
  chiefArbiter:  ['árbitro-chefe', 'arbitro-chefe', 'árbitro chefe', 'chief arbiter', 'hauptschiedsrichter'],
  organizerName: ['organizador', 'organizer', 'veranstalter'],
  timeControl:   ['ritmo', 'ritmo de jogo', 'time control', 'rate of play', 'bedenkzeit'],
};

function normalizeLabel(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

/** Converts dd.mm.yyyy to YYYY-MM-DD. Returns '' on failure. */
function parseDate(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function buildInfoUrl(base: string): string {
  try {
    const u = new URL(base);
    u.searchParams.set('art', '0');
    if (!u.searchParams.get('lan')) u.searchParams.set('lan', '10');
    return u.toString();
  } catch {
    return base;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Parâmetro url obrigatório.' }, { status: 400 });

  let html: string;
  try {
    const infoUrl = buildInfoUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(infoUrl, {
        headers: { 'User-Agent': UA },
        signal: controller.signal,
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    const msg = (err as Error).name === 'AbortError'
      ? 'Tempo limite excedido ao conectar no chess-results (10s)'
      : `Erro ao buscar página: ${(err as Error).message}`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const $ = cheerio.load(html);
  const result: ChessResultsPreview = {
    name: '', city: '', startDate: '', endDate: '',
    roundsCount: 0, chiefArbiter: '', organizerName: '', timeControl: '',
  };

  // 1. Tournament name — chess-results renders it as a bold/header element
  //    Try several selectors in order of specificity
  const nameCandidates = [
    $('h2').first().text().trim(),
    $('h3').first().text().trim(),
    $('b').filter((_, el) => $(el).text().length > 10).first().text().trim(),
    $('title').text().replace(/chess-results\.com/i, '').replace(/[|\-–].*$/, '').trim(),
  ];
  result.name = nameCandidates.find(s => s.length > 3) ?? '';

  // 2. Build a map of normalized label → raw value from ALL table rows (any table)
  const tableData = new Map<string, string>();
  $('tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length >= 2) {
      const label = normalizeLabel($(cells[0]).text());
      const value = $(cells[1]).text().trim();
      if (label && value) tableData.set(label, value);
    }
  });

  // 3. Match structured fields from table data
  for (const [field, variants] of Object.entries(LABELS) as [keyof ChessResultsPreview, string[]][]) {
    if (field === 'name') continue; // already handled above
    for (const [label, value] of tableData.entries()) {
      if (variants.some(v => label.includes(normalizeLabel(v)))) {
        if (field === 'startDate' || field === 'endDate') {
          result[field] = parseDate(value);
        } else if (field === 'roundsCount') {
          const n = parseInt(value, 10);
          if (!isNaN(n)) result[field] = n;
        } else {
          (result as any)[field] = value;
        }
        break;
      }
    }
  }

  // 4. Fallback date from plain text (common in chess-results PT pages)
  //    Looks for "DATA: dd.mm.yyyy" or "dd/mm/yyyy" anywhere in the body
  if (!result.startDate) {
    const bodyText = $('body').text();
    const m = bodyText.match(/(?:DATA[:\s]+)(\d{1,2}[./]\d{1,2}[./]\d{4})/i)
           ?? bodyText.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (m) {
      const raw = m[1].replace(/\//g, '.');
      result.startDate = parseDate(raw);
    }
  }

  // 5. Fallback city from page text (look for city patterns like "Cidade - UF")
  if (!result.city) {
    const bodyText = $('body').text();
    const m = bodyText.match(/em\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*[-–]\s*[A-Z]{2}/);
    if (m) result.city = m[1];
  }

  return NextResponse.json(result);
}
