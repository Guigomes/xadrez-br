import { describe, expect, it } from 'vitest';
import { MAX_PGN_CHARS, normalizePgn } from '../normalize';

describe('normalizePgn', () => {
  it('aceita PGN completo e uniformiza quebras de linha e BOM', () => {
    const r = normalizePgn('﻿[White "A"]\r\n[Black "B"]\r\n\r\n1. e4 e5 2. Nf3 *\r\n');
    expect(r).toEqual({ ok: true, pgn: '[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 *' });
  });

  it('aceita só os lances, sem cabeçalho', () => {
    expect(normalizePgn('1. d4 d5 2. c4 e6')).toEqual({ ok: true, pgn: '1. d4 d5 2. c4 e6' });
  });

  it('aceita só o cabeçalho (partida sem lances ainda)', () => {
    expect(normalizePgn('[Event "Rodada 2"]')).toMatchObject({ ok: true });
  });

  it.each(['', '   \n ', null, 42])('recusa %j', (v) => {
    expect(normalizePgn(v).ok).toBe(false);
  });

  it('recusa texto que não é PGN', () => {
    expect(normalizePgn('oi, segue a partida em anexo')).toMatchObject({ ok: false });
  });

  it('recusa PGN grande demais', () => {
    expect(normalizePgn(`1. e4 ${'e5 '.repeat(MAX_PGN_CHARS)}`)).toMatchObject({ ok: false });
  });
});
