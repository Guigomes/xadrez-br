/** Limite do PGN de uma partida (uma partida real tem poucos KB; isto só barra lixo/abuso). */
export const MAX_PGN_CHARS = 100_000;

export type PgnCheck = { ok: true; pgn: string } | { ok: false; error: string };

/**
 * PGN anexado pelo organizador/árbitro numa mesa de torneio nativo. O dono pediu que o PGN seja
 * aceito como veio, então não se confere jogadores nem resultado contra a mesa: só tira o BOM, uniformiza
 * as quebras de linha e recusa o que claramente não é uma partida (vazio, grande demais, sem nenhum lance
 * nem cabeçalho).
 */
export function normalizePgn(input: unknown): PgnCheck {
  if (typeof input !== 'string') return { ok: false, error: 'PGN ausente.' };
  const pgn = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!pgn) return { ok: false, error: 'O PGN está vazio.' };
  if (pgn.length > MAX_PGN_CHARS) return { ok: false, error: 'PGN grande demais (máximo 100 mil caracteres).' };
  // Cabeçalho `[Tag "valor"]` ou um número de lance `1.` — qualquer um já indica PGN.
  if (!/^\s*\[\w+\s+"/m.test(pgn) && !/\b1\.\s*\S/.test(pgn)) {
    return { ok: false, error: 'Isso não parece um PGN (sem cabeçalho nem lances).' };
  }
  return { ok: true, pgn };
}
