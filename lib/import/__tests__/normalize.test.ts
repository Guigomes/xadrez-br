import { describe, expect, it } from 'vitest';
import { canonicalCategoryName } from '../normalize';

describe('canonicalCategoryName', () => {
  it('junta U8 e U08 na mesma categoria', () => {
    expect(canonicalCategoryName('U8')).toBe('U08');
    expect(canonicalCategoryName('U08')).toBe('U08');
    expect(canonicalCategoryName('u 8')).toBe('U08');
  });

  it('mantém categorias de 2 dígitos e senior', () => {
    expect(canonicalCategoryName('U12')).toBe('U12');
    expect(canonicalCategoryName('S50')).toBe('S50');
    expect(canonicalCategoryName('s050')).toBe('S50');
  });

  it('não mexe em nome fora do padrão (só apara espaço)', () => {
    expect(canonicalCategoryName('  Feminino  ')).toBe('Feminino');
    expect(canonicalCategoryName('Sub  Absoluto')).toBe('Sub Absoluto');
  });
});
