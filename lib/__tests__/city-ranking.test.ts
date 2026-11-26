import { describe, expect, it } from 'vitest';
import { buildCityRanking, cityKey, classificationPlaces, resolveCity } from '@/lib/tournament/city-ranking';
import type { StandingRow } from '@/types/database';

const row = (tp: string, rank: number, points: number, group = 'Sub-11', state: string | null = 'MS') =>
  ({ tp_id: tp, rank, points, wins: points, draws: 0, losses: 6 - points, pairing_group_name: group, full_name: tp, state }) as unknown as StandingRow;

describe('resolveCity', () => {
  it('reconhece município com ou sem acento e com UF no fim', () => {
    expect(resolveCity('Tres Lagoas', 'MS')?.name).toBe('Três Lagoas');
    expect(resolveCity('Campo Grande MS', null, 'MS')?.key).toBe(cityKey('Campo Grande', 'MS'));
  });
  it('nome de escola não é cidade', () => {
    expect(resolveCity('Uni3 Objetivo', 'MS')).toBeNull();
    expect(resolveCity('', 'MS')).toBeNull();
  });
  it('homônimo: UF do jogador, depois a do torneio', () => {
    expect(resolveCity('Campo Grande', 'AL')?.uf).toBe('AL');
    expect(resolveCity('Campo Grande', null, 'MS')?.uf).toBe('MS');
  });
});

describe('buildCityRanking', () => {
  it('soma por cidade e ordena por pódio, top 10 e pontos por jogador', () => {
    const rows = [row('a', 1, 6), row('b', 12, 3), row('c', 2, 5), row('d', 4, 4), row('e', 5, 4)];
    const places = new Map([
      ['a', { city: 'Dourados', state: 'MS' }], ['b', { city: 'Dourados', state: 'MS' }],
      ['c', { city: 'Três Lagoas', state: 'MS' }], ['d', { city: 'Três Lagoas', state: 'MS' }],
      ['e', { city: 'Escola X', state: 'MS' }],
    ]);
    const { ranking, withoutCity, cityByTp } = buildCityRanking(rows, places, 'MS');
    expect(withoutCity).toBe(1);
    expect(cityByTp.size).toBe(4);
    expect(ranking.map((c) => c.city.name)).toEqual(['Três Lagoas', 'Dourados']);
    const tl = ranking[0];
    expect([tl.players, tl.podiums, tl.top10, tl.points]).toEqual([2, 1, 2, 9]);
    expect(ranking[1].best?.rank).toBe(1);
  });
});

describe('classificationPlaces', () => {
  it('pódio por classificação: renumera dentro da categoria do grupo', () => {
    const r = (tp: string, rank: number, cat: string | null, catName: string | null) =>
      ({ tp_id: tp, rank, points: 0, pairing_group_id: 'g1', pairing_group_name: 'Sub-07/09/11 Masc', category_id: cat, category_name: catName }) as unknown as StandingRow;
    // Grupo misto: posições 1..4 no grupo, duas categorias.
    const rows = [r('a', 1, 'c11', 'Sub-11 Masc'), r('b', 2, 'c09', 'Sub-09 Masc'), r('c', 3, 'c11', 'Sub-11 Masc'), r('d', 4, 'c09', 'Sub-09 Masc')];
    const p = classificationPlaces(rows);
    expect(p.get('b')).toEqual({ rank: 1, size: 2, section: 'Sub-09 Masc' });
    expect(p.get('d')).toEqual({ rank: 2, size: 2, section: 'Sub-09 Masc' });
    expect(p.get('c')?.rank).toBe(2);
    const { ranking } = buildCityRanking(rows, new Map(rows.map((x) => [x.tp_id, { city: 'Dourados', state: 'MS' }])), 'MS');
    expect(ranking[0].podiums).toBe(4); // no grupo seriam 3
  });
});
