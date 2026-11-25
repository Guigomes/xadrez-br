/**
 * Classificação geral OFICIAL de uma série, lida da planilha Google que o organizador
 * publica (tournament_series.official_ranking, migration 20261125210000).
 *
 * Só busca planilha publicada do Google (docs.google.com/spreadsheets/d/e/<id>/pub):
 * a coluna é gravável pelo gestor da série, e sem essa trava o servidor buscaria
 * qualquer URL que alguém salvasse ali.
 */

export interface OfficialRankingTab {
  label: string;
  gid: string;
}

export interface OfficialRankingConfig {
  source: string;
  pageUrl: string | null;
  sheetUrl: string;
  tabs: OfficialRankingTab[];
}

export interface OfficialRankingTable {
  label: string;
  headers: string[];
  rows: string[][];
  error?: string;
}

const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[A-Za-z0-9_-]+\/pub$/;

/** Valida o JSON da coluna; qualquer coisa fora do formato vira null (série calculada). */
export function parseOfficialRankingConfig(raw: unknown): OfficialRankingConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sheetUrl = typeof r.sheet_url === 'string' ? r.sheet_url.trim() : '';
  if (!SHEET_URL.test(sheetUrl)) return null;
  const tabs = Array.isArray(r.tabs)
    ? r.tabs
        .map((t) => t as Record<string, unknown>)
        .filter((t) => typeof t.label === 'string' && typeof t.gid === 'string' && /^\d{1,12}$/.test(t.gid))
        .map((t) => ({ label: (t.label as string).trim(), gid: t.gid as string }))
    : [];
  if (!tabs.length) return null;
  const pageUrl = typeof r.page_url === 'string' && /^https:\/\//.test(r.page_url) ? r.page_url : null;
  return { source: typeof r.source === 'string' && r.source.trim() ? r.source.trim() : 'organizador', pageUrl, sheetUrl, tabs };
}

/** CSV com aspas (RFC 4180): vírgula e quebra de linha dentro de aspas, "" como aspa. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Cabeçalho + linhas com atleta preenchido (a planilha da FESMAX tem ~120 linhas por aba,
 * a maioria em branco). Colunas vazias no fim são cortadas.
 */
export function tableFromCsv(label: string, text: string): OfficialRankingTable {
  const all = parseCsv(text).map((r) => r.map((c) => c.trim()));
  const headerIdx = all.findIndex((r) => r.some((c) => /^atleta$|^nome$|^jogador$/i.test(c)));
  if (headerIdx < 0) return { label, headers: [], rows: [], error: 'Formato da planilha não reconhecido.' };
  let headers = all[headerIdx];
  while (headers.length && !headers[headers.length - 1]) headers = headers.slice(0, -1);
  const nameIdx = headers.findIndex((c) => /^atleta$|^nome$|^jogador$/i.test(c));
  const rows = all
    .slice(headerIdx + 1)
    .filter((r) => (r[nameIdx] ?? '').trim())
    .map((r) => headers.map((_, i) => r[i] ?? ''));
  return { label, headers, rows };
}

/** Baixa todas as abas (CSV publicado). Cache de 10 min: a FESMAX atualiza após cada etapa. */
export async function fetchOfficialRanking(config: OfficialRankingConfig): Promise<OfficialRankingTable[]> {
  return Promise.all(
    config.tabs.map(async (tab) => {
      const url = `${config.sheetUrl}?gid=${tab.gid}&single=true&output=csv`;
      try {
        const res = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return { label: tab.label, headers: [], rows: [], error: `A planilha oficial respondeu ${res.status}.` };
        return tableFromCsv(tab.label, await res.text());
      } catch {
        return { label: tab.label, headers: [], rows: [], error: 'Não foi possível ler a planilha oficial agora.' };
      }
    }),
  );
}
