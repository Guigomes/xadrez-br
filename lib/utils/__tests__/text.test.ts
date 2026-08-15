import { describe, it, expect } from 'vitest';
import { normalizeSearchText, matchesPlayerSearch } from '../text';

describe('normalizeSearchText', () => {
  it('remove acento e caixa', () => {
    expect(normalizeSearchText('João Água')).toBe('joao agua');
  });
});

describe('matchesPlayerSearch', () => {
  it('com menos de 3 caracteres, o filtro fica inerte (casa qualquer nome)', () => {
    expect(matchesPlayerSearch('João Silva', '')).toBe(true);
    expect(matchesPlayerSearch('João Silva', 'j')).toBe(true);
    expect(matchesPlayerSearch('João Silva', 'jo')).toBe(true);
    expect(matchesPlayerSearch('Zzz Alheio', 'jo')).toBe(true);
  });

  it('a partir de 3 caracteres, filtra por trecho tolerante a acento/caixa', () => {
    expect(matchesPlayerSearch('João Silva', 'joa')).toBe(true);
    expect(matchesPlayerSearch('João Silva', 'JOA')).toBe(true);
    expect(matchesPlayerSearch('João Silva', 'sil')).toBe(true);
    expect(matchesPlayerSearch('Carlos Pereira', 'joa')).toBe(false);
  });
});
