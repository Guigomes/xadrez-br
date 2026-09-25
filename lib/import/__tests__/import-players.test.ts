import { describe, expect, it } from 'vitest';
import { parseRows } from '../import-players';

describe('parseRows do Chess-Results', () => {
  it('mapeia Gr para UF e Clube/Cidade para escola ou clube', () => {
    const rows = [
      ['Ranking inicial'],
      ['Nº.', '', 'Nome', 'ID FIDE', 'EloN', 'Gr', 'Clube/Cidade'],
      ['1', 'CM', 'Silva, Maria', '123456', '1800', 'mg', 'Colégio Exemplo'],
    ];

    expect(parseRows(rows)).toEqual([
      expect.objectContaining({
        fullName: 'Maria Silva',
        title: 'CM',
        state: 'MG',
        clubOrSchool: 'Colégio Exemplo',
      }),
    ]);
  });

  it('não grava como UF um grupo que não seja uma sigla estadual', () => {
    const rows = [
      ['Nº.', '', 'Nome', 'Gr', 'Clube/Cidade'],
      ['1', '', 'Souza, João', 'U12', 'Clube Exemplo'],
    ];

    expect(parseRows(rows)[0]).toEqual(expect.objectContaining({
      state: undefined,
      clubOrSchool: 'Clube Exemplo',
    }));
  });
});
