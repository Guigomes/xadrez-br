// O teste mais forte do serializador: o TRF gerado a partir de um estado
// sintético precisa ser ACEITO pela engine (que valida estritamente) e
// reproduzir o cenário C5 do upstream (mesmo pareamento esperado).
import { describe, it, expect } from 'vitest';
import { serializeForPairing, serializeForExport, type TrfState, type TrfExportState } from '../trf/serialize';
import { runDutchPairing } from '../engine';
import { parseEngineOutput } from '../trf/parse-output';

// Cenário espelhando dutch_2025_C5.input: 6 jogadores, 3 rodadas,
// 2 jogadas; jogador 4 excluído da rodada 3 (Z).
// R1: 1(w)×4 1-0 · 5(b)×2 0-1... — reconstruído a partir das células do fixture:
//   p1: R1 "4 w 1"  R2 "2 b 1"     p2: R1 "5 b 1"  R2 "1 w 0"
//   p3: R1 "6 w 1"  R2 "4 b 1"     p4: R1 "1 b 0"  R2 "3 w 0"  R3 Z
//   p5: R1 "2 w 0"  R2 "6 b 1"     p6: R1 "3 b 0"  R2 "5 w 0"
function c5State(): TrfState {
  const P = (n: number) => `tp-${n}`;
  const players = [2720, 2701, 2697, 2689, 2673, 2664].map((rating, i) => ({
    tpId: P(i + 1),
    startno: i + 1,
    fullName: `Test000${i + 1} Player000${i + 1}`,
    sex: null,
    rating,
    federation: null,
    fideId: null,
    birthYear: null,
    status: 'active' as const,
    joinedAtRound: 1,
  }));
  const G = (r: number, w: number, b: number, result: '1-0' | '0-1' | '1/2-1/2') => ({
    roundNumber: r, whiteTpId: P(w), blackTpId: P(b), result: result as any,
    isBye: false, byeKind: null,
    whitePoints: result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5,
    blackPoints: result === '1-0' ? 0 : result === '0-1' ? 1 : 0.5,
  });
  return {
    tournamentName: 'Dutch 2025 C5 test',
    roundsTotal: 3,
    initialColor: 'white1',
    requestedByeScore: 0,
    targetRound: 3,
    players,
    games: [
      G(1, 1, 4, '1-0'), G(1, 5, 2, '0-1'), G(1, 3, 6, '1-0'),
      G(2, 2, 1, '0-1'), G(2, 4, 3, '0-1'), G(2, 6, 5, '0-1'),
    ],
    requestedByeTpIds: new Set(['tp-4']), // score 0 → vira Z, como no fixture
  };
}

describe('serializeForPairing', () => {
  it.each([[1, 0.5, 'H', 0.5], [1, 0, 'Z', 0], [3, 0.5, 'Z', 0]] as const)(
    'round %s with configuration %s emits %s and consistent points', async (round, score, code, points) => {
      const s = c5State();
      s.targetRound = round;
      s.requestedByeScore = score;
      if (round === 1) s.games = [];
      const trf = serializeForPairing(s);
      const player = trf.split('\n').find((line) => line.startsWith('001') && Number(line.slice(4, 8)) === 4)!;
      expect(player[98 + 10 * (round - 1)]).toBe(code);
      expect(Number(player.slice(80, 84))).toBe(points);
      const res = await runDutchPairing(trf);
      expect(res.ok, res.ok ? '' : res.detail).toBe(true);
    },
  );

  it('preserves already recorded half-point byes in later rounds and in the export', async () => {
    const s = c5State();
    s.requestedByeScore = 0.5;
    s.games = s.games.filter((game) => !(game.roundNumber === 2 && game.whiteTpId === 'tp-6'));
    s.games.push(
      { roundNumber: 2, whiteTpId: 'tp-6', blackTpId: null, result: 'bye', isBye: true,
        byeKind: 'requested_half', whitePoints: 0.5, blackPoints: null },
      { roundNumber: 2, whiteTpId: 'tp-5', blackTpId: null, result: 'bye', isBye: true,
        byeKind: 'requested_zero', whitePoints: 0, blackPoints: null },
    );
    const trf = serializeForPairing(s);
    const exported = serializeForExport({
      ...s, lastRound: 2, city: null, federation: 'BRA', startDate: '2026-10-30',
      endDate: null, chiefArbiter: null, timeControl: '15+10',
      players: s.players.map((player) => ({ ...player, rank: null })),
    });
    for (const text of [trf, exported]) {
      const legacyPlayer = text.split('\n').find((line) => line.startsWith('001') && Number(line.slice(4, 8)) === 6)!;
      expect(legacyPlayer[108]).toBe('H');
      expect(Number(legacyPlayer.slice(80, 84))).toBe(0.5);
    }
    const res = await runDutchPairing(trf);
    expect(res.ok, res.ok ? '' : res.detail).toBe(true);
  });

  it('gera TRF aceito pela engine com o pareamento esperado do C5', async () => {
    const trf = serializeForPairing(c5State());
    const res = await runDutchPairing(trf);
    expect(res.ok, res.ok ? '' : `engine rejeitou: ${res.detail}\n${trf}`).toBe(true);
    if (res.ok) {
      expect(parseEngineOutput(res.output)).toEqual([
        { white: 1, black: 5 },
        { white: 3, black: 2 },
        { white: 6, black: null },
      ]);
    }
  });

  it('falha se ranking inicial tem buracos', () => {
    const s = c5State();
    s.players[2].startno = 9;
    expect(() => serializeForPairing(s)).toThrow(/Ranking inicial/);
  });

  it('falha se há resultado pendente', () => {
    const s = c5State();
    s.games[0] = { ...s.games[0], result: '*' as any };
    expect(() => serializeForPairing(s)).toThrow(/pendente/);
  });
});

describe('serializeForExport', () => {
  it.each(['forfeit_white', 'forfeit_black', 'double_forfeit'] as const)(
    'preserva os adversários e omite as cores de %s no TRF', async (result) => {
      const s = c5State();
      s.games = [{
        roundNumber: 1, whiteTpId: 'tp-1', blackTpId: 'tp-4', result,
        isBye: false, byeKind: null,
        whitePoints: result === 'forfeit_black' ? 1 : 0,
        blackPoints: result === 'forfeit_white' ? 1 : 0,
      }];
      s.targetRound = 2;
      s.requestedByeTpIds.clear();
      const exported = serializeForExport({
        ...s, lastRound: 1, city: null, federation: 'BRA', startDate: '2026-10-28',
        endDate: null, chiefArbiter: null, timeControl: '15+10',
        players: s.players.map(p => ({ ...p, rank: null })),
      });
      for (const trf of [serializeForPairing(s), exported]) {
        const lines = trf.split('\n').filter(l => l.startsWith('001'));
        const white = lines.find(l => Number(l.slice(4, 8)) === 1)!;
        const black = lines.find(l => Number(l.slice(4, 8)) === 4)!;
        expect(Number(white.slice(91, 95))).toBe(4);
        expect(Number(black.slice(91, 95))).toBe(1);
        expect(white[96]).toBe('-');
        expect(black[96]).toBe('-');
        expect(white[98]).toBe(result === 'forfeit_black' ? '+' : '-');
        expect(black[98]).toBe(result === 'forfeit_white' ? '+' : '-');
      }
      const engine = await runDutchPairing(serializeForPairing(s));
      expect(engine.ok, engine.ok ? '' : engine.detail).toBe(true);
    },
  );

  it('emite cabeçalhos FIDE, pontos e rank de todas as rodadas', () => {
    const P = (n: number) => `tp-${n}`;
    const state: TrfExportState = {
      tournamentName: 'Aberto Teste - Único',
      city: 'Campo Grande',
      federation: 'BRA',
      startDate: '2026-06-05',
      endDate: '2026-06-07',
      chiefArbiter: 'Fulano de Tal',
      timeControl: "90'+30",
      roundsTotal: 2,
      initialColor: 'white1',
      lastRound: 2,
      players: [
        { tpId: P(1), startno: 1, fullName: 'Souza, Ana', sex: 'w', rating: 2100,
          federation: 'BRA', fideId: null, birthYear: 1990, status: 'active', joinedAtRound: 1, rank: 1 },
        { tpId: P(2), startno: 2, fullName: 'Lima, Bruno', sex: 'm', rating: 1950,
          federation: 'BRA', fideId: null, birthYear: 1995, status: 'active', joinedAtRound: 1, rank: 2 },
      ],
      games: [
        { roundNumber: 1, whiteTpId: P(1), blackTpId: P(2), result: '1-0', isBye: false,
          byeKind: null, whitePoints: 1, blackPoints: 0 },
        { roundNumber: 2, whiteTpId: P(2), blackTpId: P(1), result: '1/2-1/2', isBye: false,
          byeKind: null, whitePoints: 0.5, blackPoints: 0.5 },
      ],
    };
    const trf = serializeForExport(state);
    const lines = trf.split('\n');
    expect(lines).toContain('012 Aberto Teste - Único');
    expect(lines).toContain('022 Campo Grande');
    expect(lines).toContain('042 2026/06/05');
    expect(lines).toContain('062 2');
    expect(lines).toContain('XXR 2');
    // Ana: venceu R1 e empatou R2 → 1.5 pts, rank 1
    const ana = lines.find((l) => l.startsWith('001') && l.includes('Souza'))!;
    expect(ana).toMatch(/\s1\.5\s/);
  });
});
