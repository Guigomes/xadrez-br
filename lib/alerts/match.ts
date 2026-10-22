// Regras puras dos alertas de torneio (sem banco nem rede) — testáveis.

export type TimeControl = 'std' | 'rpd' | 'blz';

export const TIME_CONTROL_LABEL: Record<TimeControl, string> = { std: 'Clássico', rpd: 'Rápido', blz: 'Blitz' };

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

export interface AlertRule {
  ufs: string[];
  timeControls: string[];
  includeCbx: boolean;
}

export interface AlertItem {
  source: 'site' | 'cbx';
  refId: string;
  name: string;
  startDate: string;
  uf: string | null;
  timeControl: TimeControl | null;
}

/**
 * Lista vazia = sem filtro naquele eixo. Torneio sem UF ou sem ritmo conhecido
 * só casa quando a regra não filtra aquele eixo — melhor não avisar do que
 * avisar errado.
 */
export function matchesRule(rule: AlertRule, item: AlertItem): boolean {
  if (item.source === 'cbx' && !rule.includeCbx) return false;
  if (rule.ufs.length && (!item.uf || !rule.ufs.includes(item.uf))) return false;
  if (rule.timeControls.length && (!item.timeControl || !rule.timeControls.includes(item.timeControl))) return false;
  return true;
}

/** Mesmo torneio pode estar no site e na CBX: some a cópia da CBX quando o nome e a data batem. */
export function dedupeAcrossSources(items: AlertItem[]): AlertItem[] {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const siteKeys = new Set(items.filter((i) => i.source === 'site').map((i) => `${i.startDate}|${norm(i.name)}`));
  return items.filter((i) => i.source === 'site' || !siteKeys.has(`${i.startDate}|${norm(i.name)}`));
}

/** Uma notificação por usuário, resumindo os torneios novos. */
export function alertMessage(items: AlertItem[]): { title: string; body: string } {
  const sorted = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const date = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  if (sorted.length === 1) {
    const i = sorted[0];
    return { title: 'Novo torneio no seu alerta', body: `${i.name} — ${date(i.startDate)}${i.uf ? `, ${i.uf}` : ''}` };
  }
  const first = sorted.slice(0, 2).map((i) => `${i.name} (${date(i.startDate)})`).join('; ');
  const more = sorted.length > 2 ? ` e mais ${sorted.length - 2}` : '';
  return { title: `${sorted.length} torneios novos no seu alerta`, body: `${first}${more}` };
}

/** Ritmo informado pela CBX ("Clássico", "Rápido", "Blitz") no código do site. */
export function cbxTimeControl(label: string | null | undefined): TimeControl | null {
  const s = String(label ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (s.startsWith('class') || s.includes('pensado') || s.includes('standard')) return 'std';
  if (s.startsWith('rap')) return 'rpd';
  if (s.startsWith('blitz') || s.startsWith('relamp')) return 'blz';
  return null;
}

// Capitais/cidades que a CBX às vezes escreve sem a UF no fim do campo "Local".
const CITY_UF: Record<string, string> = {
  brasilia: 'DF', 'sao paulo': 'SP', 'rio de janeiro': 'RJ', 'belo horizonte': 'MG', curitiba: 'PR',
  'porto alegre': 'RS', florianopolis: 'SC', salvador: 'BA', recife: 'PE', fortaleza: 'CE', manaus: 'AM',
  belem: 'PA', goiania: 'GO', 'campo grande': 'MS', cuiaba: 'MT', teresina: 'PI', 'sao luis': 'MA',
  natal: 'RN', 'joao pessoa': 'PB', maceio: 'AL', aracaju: 'SE', vitoria: 'ES', palmas: 'TO',
  'porto velho': 'RO', 'rio branco': 'AC', macapa: 'AP', 'boa vista': 'RR',
};

/** UF a partir do campo "Local" da CBX ("Campina Grande PB", "Brasilia", "Manaus - Biblioteca..."). */
export function ufFromLocation(location: string | null | undefined): string | null {
  const raw = String(location ?? '').trim();
  const tail = raw.match(/\b([A-Z]{2})\s*$/)?.[1];
  if (tail && (UFS as readonly string[]).includes(tail)) return tail;
  const city = raw.split(/\s+-\s+|,/)[0].normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  return CITY_UF[city] ?? null;
}

// Federações estaduais: "Federacao Paraibana de Xadrez" -> PB. Ordem importa:
// "sul-mato-grossense" antes de "mato-grossense".
const FEDERATION_UF: Array<[RegExp, string]> = [
  [/sul.?mato.?grossense/, 'MS'], [/mato.?grossense/, 'MT'], [/paulista/, 'SP'], [/paranaense/, 'PR'],
  [/gaucha/, 'RS'], [/catarinense/, 'SC'], [/mineira/, 'MG'], [/fluminense|carioca|estado do rio/, 'RJ'],
  [/baiana/, 'BA'], [/pernambucana/, 'PE'], [/cearense/, 'CE'], [/amazonense/, 'AM'], [/paraense/, 'PA'],
  [/goiana/, 'GO'], [/piauiense/, 'PI'], [/maranhense/, 'MA'], [/potiguar|norte.?rio.?grandense/, 'RN'],
  [/paraibana/, 'PB'], [/alagoana/, 'AL'], [/sergipana/, 'SE'], [/capixaba|espirito.?santense/, 'ES'],
  [/tocantinense/, 'TO'], [/rondoniense/, 'RO'], [/acreana/, 'AC'], [/amapaense/, 'AP'], [/roraimense/, 'RR'],
  [/brasiliense|distrito federal/, 'DF'],
];

/** UF da federação organizadora, quando o organizador é uma federação estadual. */
export function ufFromOrganizer(organizer: string | null | undefined): string | null {
  const s = String(organizer ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (!/federa/.test(s)) return null;
  return FEDERATION_UF.find(([re]) => re.test(s))?.[1] ?? null;
}
