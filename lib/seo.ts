const FALLBACK_SITE_URL = 'https://www.gambitotorneios.com.br';

/** Origem pública do site, sem barra final. Fonte única de sitemap, robots, canonical e JSON-LD. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || FALLBACK_SITE_URL).replace(/\/+$/, '');
}

/**
 * Torneio só vale pro Google se qualquer pessoa consegue abrir: público e fora
 * de rascunho (a lista pública, `search_tournaments`, usa a mesma regra). Draft
 * ou privado continua acessível por link, mas com noindex e fora do sitemap.
 */
export function isIndexableTournament(t: { is_public: boolean; status: string }): boolean {
  return t.is_public && t.status !== 'draft';
}

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "3 de outubro de 2026" / "25 a 27 de setembro de 2026" a partir de datas ISO (yyyy-mm-dd). */
export function describeDates(start: string, end: string | null): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const startText = `${sd} de ${MONTHS_PT[sm - 1]} de ${sy}`;
  if (!end || end === start) return startText;
  const [ey, em, ed] = end.split('-').map(Number);
  if (ey === sy && em === sm) return `${sd} a ${ed} de ${MONTHS_PT[sm - 1]} de ${sy}`;
  return `${startText} a ${ed} de ${MONTHS_PT[em - 1]} de ${ey}`;
}

/** Serializa JSON-LD pra dentro de <script>: `<` escapado impede um nome de torneio de fechar a tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
