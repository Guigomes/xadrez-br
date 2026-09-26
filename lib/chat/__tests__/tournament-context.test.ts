import { describe, it, expect } from 'vitest';
import { tournamentSlugFromPathname, normalizeName, matchPlayerNames } from '../tournament-context';

describe('tournamentSlugFromPathname', () => {
  it('extrai slug de página pública de torneio', () => {
    expect(tournamentSlugFromPathname('/torneios/copa-2026/standings')).toBe('copa-2026');
    expect(tournamentSlugFromPathname('/torneios/copa-2026')).toBe('copa-2026');
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
    expect(tournamentSlugFromPathname('/torneios/copa-2026?tab=x')).toBe('copa-2026');
  });
});

describe('normalizeName', () => {
  it('remove acento e caixa', () => {
    expect(normalizeName('João Água')).toBe('joao agua');
    expect(normalizeName('  MARÍA  ')).toBe('maria');
  });

  it('remove vírgulas e normaliza espaços', () => {
    expect(normalizeName('  Fernandes,  Pietro  ')).toBe('fernandes pietro');
  });
});

describe('matchPlayerNames', () => {
  const rows = [
    { full_name: 'João Silva' },
    { full_name: 'Joana Souza' },
    { full_name: 'Carlos Pereira' },
    { full_name: 'Guilherme Gomes da Silva' },
  ];

  it('casa por trecho, tolerante a acento/caixa — exact: true', () => {
    const r1 = matchPlayerNames(rows, 'joao');
    expect(r1.rows.map((r) => r.full_name)).toEqual(['João Silva']);
    expect(r1.exact).toBe(true);

    const r2 = matchPlayerNames(rows, 'JOA');
    expect(r2.rows.map((r) => r.full_name)).toEqual(['João Silva', 'Joana Souza']);
    expect(r2.exact).toBe(true);
  });

  it('sem trecho exato, cai pra partes do nome — exact: false', () => {
    // "Silva Guilherme" não é substring de "Guilherme Gomes da Silva", mas
    // as duas palavras aparecem (em qualquer ordem).
    const r = matchPlayerNames(rows, 'Silva Guilherme');
    expect(r.rows.map((row) => row.full_name)).toEqual(['Guilherme Gomes da Silva']);
    expect(r.exact).toBe(false);
  });

  it('trata o nome completo com vírgula e ordem diferente como exato', () => {
    const players = [{ full_name: 'Pietro Nishimura Caste Fernandes' }];

    for (const alias of [
      'Fernandes, Pietro Nishimura Caste',
      'Pietro Nishimura Caste, Fernandes',
    ]) {
      const result = matchPlayerNames(players, alias);
      expect(result.rows).toEqual(players);
      expect(result.exact).toBe(true);
    }
  });

  it('nem trecho nem partes batem, lista vazia', () => {
    expect(matchPlayerNames(rows, 'zzz').rows).toEqual([]);
  });

  it('query vazia, lista vazia', () => {
    expect(matchPlayerNames(rows, '   ').rows).toEqual([]);
  });

  it('respeita o limite', () => {
    expect(matchPlayerNames(rows, 'a', 1).rows).toHaveLength(1);
  });
});
