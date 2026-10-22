import { describe, expect, it } from 'vitest';
import { groupSummary, memberAge, memberPct, sortMembers, type GroupMemberRow } from '../groups/overview';

const m = (over: Partial<GroupMemberRow>): GroupMemberRow => ({
  player_id: over.full_name ?? 'x', full_name: 'X', title: null, cbx_id: null, state: null, birth_year: null,
  rating_std: null, rating_rpd: null, rating_blz: null, note: null, games: 0, points: 0, pgn_games: 0,
  last_tournament_name: null, last_tournament_date: null, ...over,
});

const rows = [
  m({ full_name: 'Bruno', rating_std: 1500, games: 10, points: 8 }),
  m({ full_name: 'Ana', rating_std: 1800, games: 2, points: 2 }),
  m({ full_name: 'Caio', rating_std: null, games: 5, points: '2.5', pgn_games: 3 }),
  m({ full_name: 'Duda', rating_std: 1500, games: 0, points: 0 }),
];

describe('ranking interno', () => {
  it('por rating: maior primeiro, empate pelo nome, sem rating no fim', () => {
    expect(sortMembers(rows, 'std').map((r) => r.full_name)).toEqual(['Ana', 'Bruno', 'Duda', 'Caio']);
  });

  it('aproveitamento exige o mínimo de partidas', () => {
    expect(sortMembers(rows, 'pct').map((r) => r.full_name)).toEqual(['Bruno', 'Caio', 'Ana', 'Duda']);
  });

  it('mais ativos e por nome', () => {
    expect(sortMembers(rows, 'games')[0].full_name).toBe('Bruno');
    expect(sortMembers(rows, 'name').map((r) => r.full_name)).toEqual(['Ana', 'Bruno', 'Caio', 'Duda']);
  });
});

describe('números do membro e do grupo', () => {
  it('aproveitamento e idade', () => {
    expect(memberPct({ games: 4, points: '3' })).toBe(75);
    expect(memberPct({ games: 0, points: 0 })).toBeNull();
    expect(memberAge(2016, new Date('2026-10-22'))).toBe(10);
    expect(memberAge(null)).toBeNull();
  });

  it('resumo do grupo', () => {
    expect(groupSummary(rows)).toEqual({ members: 4, active: 3, games: 17, pgnGames: 3, avgStd: 1600 });
  });
});
