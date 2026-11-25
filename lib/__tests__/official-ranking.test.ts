import { describe, expect, it } from 'vitest';
import { parseCsv, parseOfficialRankingConfig, tableFromCsv } from '../series/official-ranking';

const SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-abc_123/pub';

describe('classificação oficial de série (planilha publicada)', () => {
  it('aceita só planilha publicada do Google', () => {
    const ok = parseOfficialRankingConfig({ source: 'FESMAX', sheet_url: SHEET, tabs: [{ label: 'Sub-07 Masc', gid: '506175313' }] });
    expect(ok?.tabs).toEqual([{ label: 'Sub-07 Masc', gid: '506175313' }]);
    for (const sheet_url of ['https://evil.example/pub', 'http://docs.google.com/spreadsheets/d/e/x/pub', `${SHEET}?gid=1`, 'https://docs.google.com.evil.io/spreadsheets/d/e/x/pub']) {
      expect(parseOfficialRankingConfig({ sheet_url, tabs: [{ label: 'a', gid: '1' }] })).toBeNull();
    }
    expect(parseOfficialRankingConfig({ sheet_url: SHEET, tabs: [{ label: 'a', gid: '1&x=2' }] })).toBeNull();
    expect(parseOfficialRankingConfig(null)).toBeNull();
  });

  it('lê CSV com aspas e vírgula no nome', () => {
    expect(parseCsv('a,"Kaori Shikasho, Kariny",3\r\n"x ""y""",,\n')).toEqual([
      ['a', 'Kaori Shikasho, Kariny', '3'],
      ['x "y"', '', ''],
    ]);
  });

  it('mantém cabeçalho e só as linhas com atleta', () => {
    const csv = 'Pos,Atleta,Escola/Projeto,Município,ETP1,ETP2,Final,Descarte,Total,\n1,Miguel Oliveira Silva,Montessori,Campo Grande,20,20,,0,40,\n,,,,,,,,,\n';
    const t = tableFromCsv('Sub-07 Masc', csv);
    expect(t.headers).toEqual(['Pos', 'Atleta', 'Escola/Projeto', 'Município', 'ETP1', 'ETP2', 'Final', 'Descarte', 'Total']);
    expect(t.rows).toEqual([['1', 'Miguel Oliveira Silva', 'Montessori', 'Campo Grande', '20', '20', '', '0', '40']]);
    expect(tableFromCsv('x', 'foo,bar\n1,2').error).toBeTruthy();
  });
});
