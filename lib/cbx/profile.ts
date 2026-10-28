import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (compatible; chess-viewer-admin)';

export interface CbxProfile {
  playerName: string;
  birthYear: number | null;
  state: string | null;
  fideId: string | null;
  ratingStd: number | null;
  ratingRpd: number | null;
  ratingBlz: number | null;
}

/**
 * Lê o perfil público de um jogador na CBX — não pelo formulário de busca
 * (cbx.org.br/rating), que é um único <form method=post> ASP.NET WebForms por
 * página inteira, com __VIEWSTATE, bem mais frágil de simular. O perfil
 * individual é uma URL GET direta, sem token nenhum: cbx.org.br/jogador/{id}.
 * Confirmado ao vivo (2026-07 e 2026-10): jogador existente tem
 * <div id="dados-jogador-row1"><h2>{nome}</h2><span>Data Nasc.: <strong>dd/mm/aaaa
 * (N anos)</strong>UF: <strong>MS</strong>ID CBX: …ID FIDE: <strong>…</strong></span></div>
 * e uma tabela <table id="ContentPlaceHolder1_gdvRating"> com colunas
 * Mês/Ano | Clássico | Rápido | Blitz — a primeira linha de dados é a mais
 * recente. Jogador inexistente: mesma página, sem #dados-jogador-row1 → null.
 * Lança erro em falha de rede/HTTP (AbortError depois de 10s).
 */
export async function fetchCbxProfile(cbxId: string): Promise<CbxProfile | null> {
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
  if (!playerName) return null;

  // Cada rótulo ("Data Nasc.:", "UF:", "ID FIDE:") é texto solto seguido do valor num <strong>.
  const field = (label: string): string | null => {
    const strong = $('#dados-jogador-row1 span strong').filter((_, el) => {
      const prev = el.previousSibling;
      return !!prev && prev.type === 'text' && prev.data.trim().startsWith(label);
    }).first();
    return strong.length ? strong.text().trim() || null : null;
  };
  const birthYear = Number(/\d{2}\/\d{2}\/(\d{4})/.exec(field('Data Nasc.') ?? '')?.[1]) || null;
  const state = field('UF');
  const fideId = field('ID FIDE');

  const firstDataRow = $('table#ContentPlaceHolder1_gdvRating tbody tr').eq(1); // eq(0) é o cabeçalho
  const cells = firstDataRow.find('td');
  const parseCell = (i: number): number | null => {
    const n = parseInt(cells.eq(i).text().trim(), 10);
    return Number.isFinite(n) ? n : null;
  };

  return {
    playerName,
    birthYear,
    state: state && /^[A-Z]{2}$/.test(state) ? state : null,
    fideId: fideId && /^\d+$/.test(fideId) && fideId !== '0' ? fideId : null,
    ratingStd: parseCell(1),
    ratingRpd: parseCell(2),
    ratingBlz: parseCell(3),
  };
}
