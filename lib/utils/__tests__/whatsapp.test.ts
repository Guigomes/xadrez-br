import { describe, it, expect } from 'vitest';
import { buildStandingsMessage, buildRoundMessage } from '../whatsapp';

const RESULT_LABELS: Record<string, string> = {
  '1-0': '1-0',
  '1/2-1/2': '½-½',
  '0-1': '0-1',
  '*': 'sem resultado',
};

describe('buildStandingsMessage', () => {
  it('usa o rank de cada linha e formata meio ponto', () => {
    const msg = buildStandingsMessage({
      tournamentName: 'Copa 2026',
      heading: 'Absoluto',
      roundLabel: 'Rodada 3 · Em andamento',
      rows: [
        { rank: 1, full_name: 'Ana', points: 3.5 },
        { rank: 2, full_name: 'Bruno', points: 3 },
      ],
    });
    expect(msg).toContain('🏆 Copa 2026');
    expect(msg).toContain('📊 Classificação — Absoluto');
    expect(msg).toContain('Rodada 3 · Em andamento');
    expect(msg).toContain('1. Ana — 3½ pts');
    expect(msg).toContain('2. Bruno — 3 pts');
  });

  it('sem rank, cai pra posição na lista', () => {
    const msg = buildStandingsMessage({
      tournamentName: 'X',
      heading: 'Sub-12',
      rows: [
        { rank: null, full_name: 'Carla', points: 1 },
        { rank: null, full_name: 'Diego', points: 0 },
      ],
    });
    expect(msg).toContain('1. Carla — 1 pts');
    expect(msg).toContain('2. Diego — 0 pts');
  });

  it('anexa a URL no rodapé quando informada', () => {
    const msg = buildStandingsMessage({
      tournamentName: 'X', heading: 'Absoluto',
      rows: [{ rank: 1, full_name: 'Ana', points: 1 }],
      url: 'https://ex.com/t/x/standings',
    });
    expect(msg.endsWith('https://ex.com/t/x/standings')).toBe(true);
  });

  it('trunca acima do limite e diz quantos sobraram', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, full_name: `P${i + 1}`, points: 0 }));
    const msg = buildStandingsMessage({ tournamentName: 'X', heading: 'Absoluto', rows });
    expect(msg).toContain('… e mais 20');
    expect(msg).not.toContain('P100 —');
  });
});

describe('buildRoundMessage', () => {
  it('lista as mesas com o rótulo do resultado', () => {
    const msg = buildRoundMessage({
      tournamentName: 'Copa 2026',
      roundNumber: 2,
      statusLabel: 'Em andamento',
      resultLabels: RESULT_LABELS,
      pairings: [
        { board_number: 1, white_name: 'Ana', black_name: 'Bruno', result: '1-0', is_bye: false },
        { board_number: 2, white_name: 'Carla', black_name: 'Diego', result: '*', is_bye: false },
      ],
    });
    expect(msg).toContain('♟ Rodada 2 · Em andamento');
    expect(msg).toContain('Mesa 1: Ana × Bruno — 1-0');
    expect(msg).toContain('Mesa 2: Carla × Diego — sem resultado');
  });

  it('agrupa os byes numa linha no fim', () => {
    const msg = buildRoundMessage({
      tournamentName: 'X', roundNumber: 1, statusLabel: 'Em andamento', resultLabels: RESULT_LABELS,
      pairings: [
        { board_number: 1, white_name: 'Ana', black_name: 'Bruno', result: '*', is_bye: false },
        { board_number: null, white_name: 'Eva', black_name: '', result: 'bye', is_bye: true },
        { board_number: null, white_name: 'Fábio', black_name: '', result: 'bye', is_bye: true },
      ],
    });
    expect(msg).toContain('Bye: Eva, Fábio');
    expect(msg).not.toContain('Eva ×');
  });

  it('inclui o nome do grupo quando informado', () => {
    const msg = buildRoundMessage({
      tournamentName: 'X', roundNumber: 3, groupName: 'Sub-10', statusLabel: 'Finalizada', resultLabels: RESULT_LABELS,
      pairings: [{ board_number: 1, white_name: 'Ana', black_name: 'Bruno', result: '1-0', is_bye: false }],
    });
    expect(msg).toContain('♟ Rodada 3 — Sub-10 · Finalizada');
  });
});
