// Leitura do calendário de torneios da CBX (https://www.cbx.org.br/torneios).
// Página ASP.NET: o mês vem de dois <select> com postback e a lista é paginada
// (30 por página, também por postback). Só leitura; poucos pedidos por dia.

import { cbxTimeControl, ufFromLocation, ufFromOrganizer, type TimeControl } from './match';

const BASE = 'https://www.cbx.org.br/torneios';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (GambitoTorneios alertas)' };

export interface CbxCalendarEvent {
  cbxId: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string | null;
  uf: string | null;
  timeControl: TimeControl | null;
  rating: string | null;
  organizer: string | null;
  status: string | null;
}

function hiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = m[0].match(/name="([^"]*)"/)?.[1];
    const value = m[0].match(/value="([^"]*)"/)?.[1] ?? '';
    if (name) fields[name] = value.replace(/&amp;/g, '&');
  }
  return fields;
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').trim();

function field(html: string, key: string, index: number): string {
  const re = new RegExp(`id="ContentPlaceHolder1_gdvMain_${key}_${index}"[^>]*>([^]*?)</span>`);
  return decode(html.match(re)?.[1] ?? '');
}

/** Extrai os torneios de uma página da lista. Exportada para teste. */
export function parseCalendarPage(html: string): CbxCalendarEvent[] {
  const out: CbxCalendarEvent[] = [];
  for (let i = 0; i < 100; i++) {
    const name = field(html, 'lblNomeTorneio', i);
    if (!name) continue;
    const period = field(html, 'lblPeriodo', i).match(/(\d\d)\/(\d\d)\/(\d{4}) a (\d\d)\/(\d\d)\/(\d{4})/);
    const cbxId = field(html, 'lblIDTorneio', i).replace(/^ID do Torneio:\s*/, '');
    if (!period || !cbxId) continue;
    const location = field(html, 'lblLocal', i).replace(/^Local:\s*/, '') || null;
    const strip = (k: string, prefix: RegExp) => field(html, k, i).replace(prefix, '') || null;
    const organizer = strip('lblOrganizador', /^Organizador:\s*/);
    out.push({
      cbxId,
      name,
      startDate: `${period[3]}-${period[2]}-${period[1]}`,
      endDate: `${period[6]}-${period[5]}-${period[4]}`,
      location,
      // Local sem UF ("Sao Carlos"): usa a federação organizadora, quando for estadual.
      uf: ufFromLocation(location) ?? ufFromOrganizer(organizer),
      timeControl: cbxTimeControl(strip('lblRitmo', /^Ritmo:\s*/)),
      rating: strip('lblRating', /^Rating:\s*/),
      organizer,
      status: strip('lblStatus', /^Situação:\s*/),
    });
  }
  return out;
}

export function totalOf(html: string): number {
  return Number(html.match(/Total de Torneios:\s*(\d+)/)?.[1] ?? 0);
}

async function post(cookie: string, html: string, extra: Record<string, string>): Promise<string> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ ...hiddenFields(html), ...extra }),
  });
  if (!res.ok) throw new Error(`CBX respondeu ${res.status}`);
  return res.text();
}

/** Todos os torneios de um mês (1–12). */
export async function fetchCbxMonth(year: number, month: number): Promise<CbxCalendarEvent[]> {
  const first = await fetch(BASE, { headers: HEADERS });
  if (!first.ok) throw new Error(`CBX respondeu ${first.status}`);
  const cookie = (first.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  let html = await first.text();

  const selected = (id: string) =>
    html.match(new RegExp(`id="${id}"[^]*?</select>`))?.[0].match(/<option selected="selected" value="([^"]*)"/)?.[1];
  if (selected('ContentPlaceHolder1_cboAno') !== String(year) || selected('ContentPlaceHolder1_cboMes') !== String(month)) {
    html = await post(cookie, html, {
      __EVENTTARGET: 'ctl00$ContentPlaceHolder1$cboMes',
      __EVENTARGUMENT: '',
      'ctl00$ContentPlaceHolder1$cboAno': String(year),
      'ctl00$ContentPlaceHolder1$cboMes': String(month),
    });
  }

  const events = parseCalendarPage(html);
  const pages = Math.min(Math.ceil(totalOf(html) / 30), 20);
  for (let page = 2; page <= pages; page++) {
    html = await post(cookie, html, { __EVENTTARGET: 'ctl00$ContentPlaceHolder1$gdvMain', __EVENTARGUMENT: `Page$${page}` });
    events.push(...parseCalendarPage(html));
  }
  const unique = new Map(events.map((e) => [e.cbxId, e]));
  return [...unique.values()];
}
