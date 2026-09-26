import { describe, expect, it } from 'vitest';
import { parseRows } from '../import-players';

describe('parseRows do Chess-Results', () => {
  it('mapeia Gr para UF e Clube/Cidade para escola ou clube', () => {
    const rows = [
      ['Ranking inicial'],
      ['Nº.', '', 'Nome', 'ID FIDE', 'EloN', 'Gr', 'Clube/Cidade'],
      ['1', 'CM', 'Maria, Silva', '123456', '1800', 'mg', 'Colégio Exemplo'],
    ];

    expect(parseRows(rows)).toEqual([
      expect.objectContaining({
        fullName: 'Maria Silva',
        sourceName: 'Maria, Silva',
        title: 'CM',
        state: 'MG',
        clubOrSchool: 'Colégio Exemplo',
      }),
    ]);
  });

  it('preserva a ordem da fonte e guarda o nome original como alias', () => {
    const rows = [
      ['Nº.', '', 'Nome', 'ID FIDE'],
      ['1', '', 'Pietro Nishimura Caste, Fernandes', '538001900'],
    ];

    expect(parseRows(rows)[0]).toEqual(expect.objectContaining({
      fullName: 'Pietro Nishimura Caste Fernandes',
      sourceName: 'Pietro Nishimura Caste, Fernandes',
      fideId: '538001900',
    }));
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
