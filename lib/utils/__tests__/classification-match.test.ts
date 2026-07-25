import { describe, it, expect } from 'vitest';
import { deriveCategory, generateClassificationCells, type CategoryCandidate } from '../classification-match';

const cat = (id: string, over: Partial<CategoryCandidate> = {}): CategoryCandidate => ({
  id,
  sortOrder: 0,
  sex: null,
  minAge: null,
  maxAge: null,
  minRating: null,
  maxRating: null,
  ...over,
});

describe('generateClassificationCells', () => {
  it('só feminina marcada gera uma célula "Feminino" avulsa (a vazia é o Geral)', () => {
    const cells = generateClassificationCells({ ageBands: [], ratingBands: [], female: true });
    expect(cells.map((c) => c.name)).toEqual(['Feminino']);
  });

  it('só idade gera uma célula por faixa, sem sufixo', () => {
    const cells = generateClassificationCells({
      ageBands: [{ name: 'Sub-8', minAge: null, maxAge: 8 }, { name: 'Sub-10', minAge: null, maxAge: 10 }],
      ratingBands: [],
      female: false,
    });
    expect(cells.map((c) => c.name)).toEqual(['Sub-8', 'Sub-10']);
  });

  it('idade + feminina cruza: cada faixa gera a geral e a feminina, nunca uma "Feminino" avulsa', () => {
    const cells = generateClassificationCells({
      ageBands: [{ name: 'Sub-17', minAge: null, maxAge: 17 }],
      ratingBands: [],
      female: true,
    });
    expect(cells.map((c) => c.name)).toEqual(['Sub-17', 'Sub-17 Feminino']);
  });

  it('nenhuma dimensão marcada não gera célula nenhuma', () => {
    expect(generateClassificationCells({ ageBands: [], ratingBands: [], female: false })).toEqual([]);
  });
});

describe('deriveCategory', () => {
  it('mulher Sub-17 cai na célula mais específica (Sub-17 Feminino), não na Sub-17 geral', () => {
    const sub17 = cat('sub17', { maxAge: 17 });
    const sub17fem = cat('sub17fem', { maxAge: 17, sex: 'w' });
    const result = deriveCategory([sub17, sub17fem], { sex: 'w', birthYear: 2010, ratingStd: null }, 2026);
    expect(result?.id).toBe('sub17fem');
  });

  it('homem Sub-17 cai na Sub-17 geral (sexo nulo na célula aceita quem não é feminino)', () => {
    const sub17 = cat('sub17', { maxAge: 17 });
    const sub17fem = cat('sub17fem', { maxAge: 17, sex: 'w' });
    const result = deriveCategory([sub17, sub17fem], { sex: 'm', birthYear: 2010, ratingStd: null }, 2026);
    expect(result?.id).toBe('sub17');
  });

  it('sem ano de nascimento, não casa com célula de idade — fica null (só Geral)', () => {
    const sub17 = cat('sub17', { maxAge: 17 });
    const result = deriveCategory([sub17], { sex: 'm', birthYear: null, ratingStd: null }, 2026);
    expect(result).toBeNull();
  });

  it('sem sexo declarado, não casa com célula que exige sexo', () => {
    const fem = cat('fem', { sex: 'w' });
    const result = deriveCategory([fem], { sex: null, birthYear: null, ratingStd: null }, 2026);
    expect(result).toBeNull();
  });

  it('desempate por sortOrder quando a especificidade é igual', () => {
    const a = cat('a', { sex: 'w', sortOrder: 1 });
    const b = cat('b', { sex: 'w', sortOrder: 0 });
    const result = deriveCategory([a, b], { sex: 'w', birthYear: null, ratingStd: null }, 2026);
    expect(result?.id).toBe('b');
  });
});
