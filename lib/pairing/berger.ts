// Gerador de rodízio (round-robin) por tabela de Berger.
//
// Round-robin: cada jogador enfrenta todos os outros uma vez. Com n par são
// n-1 rodadas; com n ímpar adiciona-se um "fantasma" (slot n+1) e quem o
// enfrenta folga naquela rodada. O agendamento é fixo (não depende de
// resultados), derivado do número de largada (seed) de cada jogador.
//
// Método do círculo (equivalente às tabelas de Berger da FIDE): o slot n
// fica fixo e os demais rotacionam a cada rodada. A cor do slot fixo alterna
// por rodada, o que mantém o equilíbrio de cores ao longo do torneio.

export interface BergerPair {
  /** slot de largada (1..n) das brancas */
  white: number;
  /** slot de largada (1..n) das pretas */
  black: number;
}

/** Número total de rodadas de um rodízio simples com `count` jogadores. */
export function roundRobinTotalRounds(count: number): number {
  const n = count % 2 === 0 ? count : count + 1;
  return n - 1;
}

/**
 * Pares de UMA rodada (1-based) de um rodízio com `n` slots.
 * `n` deve ser par — quem chama preenche campo ímpar com o fantasma (slot n).
 * Retorna slots 1..n; o par que contém o slot fantasma é a folga.
 */
export function bergerRoundPairs(n: number, round: number): BergerPair[] {
  if (n % 2 !== 0) throw new Error('bergerRoundPairs: n deve ser par');
  if (round < 1 || round > n - 1) {
    throw new Error(`bergerRoundPairs: rodada ${round} fora de 1..${n - 1}`);
  }
  const r = round - 1;
  const m = n - 1; // slots que rotacionam (1..n-1); slot n é fixo
  const half = n / 2;
  const pairs: BergerPair[] = [];

  for (let i = 0; i < half; i++) {
    let home: number;
    let away: number;
    if (i === 0) {
      home = n; // slot fixo
      away = (r % m) + 1;
    } else {
      home = ((r + i) % m) + 1;
      away = (((r - i) % m + m) % m) + 1;
    }
    // Alterna a cor do confronto do slot fixo a cada rodada, para equilíbrio.
    if (r % 2 === 0 && i === 0) pairs.push({ white: away, black: home });
    else pairs.push({ white: home, black: away });
  }

  return pairs;
}
