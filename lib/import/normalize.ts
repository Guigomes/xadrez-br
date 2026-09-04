// Portado de ../../cron-import/src/normalize.ts (worker cron-import) — usado
// pelo import sob demanda (app/api/admin/dev/force-import) pra rodar a MESMA
// lógica de casamento de nome do worker agendado, sem esperar o próximo tick.
// Se o worker mudar essa lógica, replicar aqui também (ver comentário em
// process-tournament.ts sobre o par dos dois arquivos).

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Chave de casamento de nome de jogador, insensível à ORDEM das palavras —
 * não só a acento/caixa. chess-results não é consistente entre a planilha
 * de jogadores e a de pareamentos de um mesmo torneio: às vezes uma delas
 * grafa "Nome, Resto" em vez do "Sobrenome, Nome" de sempre, e o import
 * (players ou pairings) inverte errado ao tentar reconstruir "Nome
 * Sobrenome" a partir da vírgula. Ordenar as palavras alfabeticamente antes
 * de comparar cancela esse tipo de inversão dos dois lados ao mesmo tempo,
 * sem precisar adivinhar qual convenção a fonte usou daquela vez — "Ana
 * Livia Marques Xavier" e "Livia Marques Xavier Ana" caem na mesma chave.
 * Vírgula é tratada como separador de palavra, não como marcador de ordem.
 */
export function normalizeNameKey(value: string): string {
  return normalize(value.replace(/,/g, ' '))
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function colIndex(headers: string[], aliases: string[]): number {
  const norm = aliases.map(normalize);
  return headers.findIndex((h) => norm.includes(normalize(h)));
}
