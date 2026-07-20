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
