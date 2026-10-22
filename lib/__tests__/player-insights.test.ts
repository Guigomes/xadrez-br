import { describe, expect, it } from 'vitest';
import type { HGame, Outcome } from '../player-history/types';
import { byColor, byStrength, byTimeControl, performanceDelta, streaks, tally, tournamentPerformances } from '../player-history/insights';

let n = 0;
function g(over: Partial<HGame> & { outcome: Outcome }): HGame {
  n += 1;
  return {
    id: `g${n}`, source: 'history', tournamentId: 't1', tournamentSlug: 't1', tournamentName: 'Torneio 1', date: '2026-01-10',
    timeControl: 'Clássico', homologated: true, groupName: null, round: n, color: 'white', whiteName: 'Eu', blackName: 'Ele',
    result: '1-0', hasPgn: false, myRating: 1500,
    opp: { key: `o${n}`, id: null, name: 'Ele', cbxId: null, rating: 1500, title: null },
    ...over,
  };
}

describe('aproveitamento', () => {
  it('conta pontos e ignora W.O.', () => {
    const t = tally([g({ outcome: 'win' }), g({ outcome: 'draw' }), g({ outcome: 'loss' }), g({ outcome: 'forfeit_win' })]);
    expect(t).toEqual({ played: 3, points: 1.5, wins: 1, draws: 1, losses: 1, pct: 50 });
  });

  it('separa por cor', () => {
    const r = byColor([g({ outcome: 'win', color: 'white' }), g({ outcome: 'loss', color: 'black' }), g({ outcome: 'draw', color: 'black' })]);
    expect(r.white.pct).toBe(100);
    expect(r.black).toMatchObject({ played: 2, points: 0.5, pct: 25 });
  });

  it('separa por ritmo na ordem clássico, rápido, blitz', () => {
    const r = byTimeControl([g({ outcome: 'win', timeControl: 'Blitz' }), g({ outcome: 'win', timeControl: 'Clássico' }), g({ outcome: 'loss', timeControl: null })]);
    expect(r.map((x) => x.label)).toEqual(['Clássico', 'Blitz', 'Sem ritmo informado']);
  });

  it('separa pela força do adversário, só com os dois ratings', () => {
    const r = byStrength([
      g({ outcome: 'win', myRating: 1500, opp: { key: 'a', id: null, name: 'A', cbxId: null, rating: 1650, title: null } }),
      g({ outcome: 'loss', myRating: 1500, opp: { key: 'b', id: null, name: 'B', cbxId: null, rating: 1550, title: null } }),
      g({ outcome: 'win', myRating: 1500, opp: { key: 'c', id: null, name: 'C', cbxId: null, rating: 1400, title: null } }),
      g({ outcome: 'win', myRating: null }),
    ]);
    expect(r.rated).toBe(3);
    expect(r.bands.stronger.wins).toBe(1);
    expect(r.bands.similar.losses).toBe(1);
    expect(r.bands.weaker.wins).toBe(1);
  });
});

describe('performance', () => {
  it('delta logístico, simétrico e limitado a ±800', () => {
    expect(performanceDelta(0.5)).toBe(0);
    expect(performanceDelta(0.75)).toBe(191);
    expect(performanceDelta(0.25)).toBe(-191);
    expect(performanceDelta(1)).toBe(800);
    expect(performanceDelta(0)).toBe(-800);
  });

  it('por torneio: média dos adversários com rating + delta, em ordem de data', () => {
    const list = tournamentPerformances([
      g({ outcome: 'win', tournamentId: 'b', tournamentName: 'B', date: '2026-03-01', opp: { key: 'x', id: null, name: 'X', cbxId: null, rating: 1600, title: null } }),
      g({ outcome: 'draw', tournamentId: 'b', tournamentName: 'B', date: '2026-03-01', opp: { key: 'y', id: null, name: 'Y', cbxId: null, rating: 1400, title: null } }),
      g({ outcome: 'loss', tournamentId: 'a', tournamentName: 'A', date: '2026-01-01', opp: { key: 'z', id: null, name: 'Z', cbxId: null, rating: null, title: null } }),
    ]);
    expect(list.map((t) => t.name)).toEqual(['A', 'B']);
    expect(list[0]).toMatchObject({ played: 1, points: 0, avgOpponent: null, performance: null });
    expect(list[1]).toMatchObject({ played: 2, points: 1.5, avgOpponent: 1500, performance: 1691, myRating: 1500 });
  });
});

describe('sequências', () => {
  it('invencibilidade atual, melhor invencibilidade e melhor série de vitórias', () => {
    const games = [
      g({ outcome: 'win', round: 1 }), g({ outcome: 'win', round: 2 }), g({ outcome: 'draw', round: 3 }),
      g({ outcome: 'loss', round: 4 }), g({ outcome: 'win', round: 5 }), g({ outcome: 'forfeit_loss', round: 6 }),
    ];
    expect(streaks(games)).toEqual({ currentUnbeaten: 1, bestUnbeaten: 3, bestWins: 2 });
  });
});
