/** lowercase + remove acento (NFD) — pra "joao" casar com "João". */
export function normalizeSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Busca de jogador por nome, usada nos campos de busca da classificação e
 * das rodadas. Com menos de 3 caracteres digitados o filtro fica inerte
 * (retorna true pra qualquer nome) — pedido explícito: 1-2 letras casam
 * gente demais numa lista grande pra servir de filtro.
 */
export function matchesPlayerSearch(name: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (q.length < 3) return true;
  return normalizeSearchText(name).includes(q);
}
