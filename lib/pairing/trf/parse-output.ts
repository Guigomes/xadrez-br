// Parseia a saída do bbpPairings (-p): 1ª linha = nº de pares;
// linhas seguintes = "startno_branco startno_preto" (0 = bye).

export interface ParsedPair {
  white: number;
  black: number | null; // null = bye de pareamento
}

export function parseEngineOutput(output: string): ParsedPair[] {
  const lines = output.trim().split(/\r?\n/);
  const count = parseInt(lines[0], 10);
  if (!Number.isFinite(count)) {
    throw new Error(`Saída inesperada da engine: ${JSON.stringify(lines[0])}`);
  }
  const pairs: ParsedPair[] = [];
  for (let i = 1; i <= count; i++) {
    const m = lines[i]?.trim().split(/\s+/);
    if (!m || m.length !== 2) {
      throw new Error(`Linha de par inválida: ${JSON.stringify(lines[i])}`);
    }
    const white = parseInt(m[0], 10);
    const black = parseInt(m[1], 10);
    pairs.push({ white, black: black === 0 ? null : black });
  }
  return pairs;
}
