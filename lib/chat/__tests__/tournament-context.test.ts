import { describe, it, expect } from 'vitest';
import { tournamentSlugFromPathname, normalizeName, matchPlayerNames } from '../tournament-context';

describe('tournamentSlugFromPathname', () => {
  it('extrai slug de página pública de torneio', () => {
    expect(tournamentSlugFromPathname('/tournaments/copa-2026/standings')).toBe('copa-2026');
    expect(tournamentSlugFromPathname('/tournaments/copa-2026')).toBe('copa-2026');
  });

  it('extrai slug de página admin de torneio', () => {
    expect(tournamentSlugFromPathname('/admin/tournaments/copa-2026/rounds')).toBe('copa-2026');
  });

  it('ignora o segmento reservado /new', () => {
    expect(tournamentSlugFromPathname('/admin/tournaments/new')).toBeNull();
  });

  it('retorna null fora de páginas de torneio', () => {
    expect(tournamentSlugFromPathname('/')).toBeNull();
    expect(tournamentSlugFromPathname('/admin')).toBeNull();
    expect(tournamentSlugFromPathname('/players')).toBeNull();
    expect(tournamentSlugFromPathname(null)).toBeNull();
    expect(tournamentSlugFromPathname(undefined)).toBeNull();
  });

  it('descarta query string e hash do slug', () => {
    expect(tournamentSlugFromPathname('/tournaments/copa-2026?tab=x')).toBe('copa-2026');
  });
});

describe('normalizeName', () => {
  it('remove acento e caixa', () => {
    expect(normalizeName('João Água')).toBe('joao agua');
    expect(normalizeName('  MARÍA  ')).toBe('maria');
  });
});

describe('matchPlayerNames', () => {
  const rows = [
    { full_name: 'João Silva' },
    { full_name: 'Joana Souza' },
    { full_name: 'Carlos Pereira' },
  ];

  it('casa por trecho, tolerante a acento/caixa', () => {
    expect(matchPlayerNames(rows, 'joao').map((r) => r.full_name)).toEqual(['João Silva']);
    expect(matchPlayerNames(rows, 'JOA').map((r) => r.full_name)).toEqual(['João Silva', 'Joana Souza']);
  });

  it('sem casamento, lista vazia', () => {
    expect(matchPlayerNames(rows, 'zzz')).toEqual([]);
  });

  it('query vazia, lista vazia', () => {
    expect(matchPlayerNames(rows, '   ')).toEqual([]);
  });

  it('respeita o limite', () => {
    expect(matchPlayerNames(rows, 'a', 1)).toHaveLength(1);
  });
});
