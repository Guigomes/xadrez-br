import { describe, expect, it } from 'vitest';
import { getTournamentStartLabel } from '../date';

describe('getTournamentStartLabel', () => {
  it('descreve hoje, amanhã e dias futuros', () => {
    expect(getTournamentStartLabel('2026-09-24', '2026-09-24')).toBe('Começa hoje');
    expect(getTournamentStartLabel('2026-09-25', '2026-09-24')).toBe('Começa amanhã');
    expect(getTournamentStartLabel('2026-09-28', '2026-09-24')).toBe('Começa em 4 dias');
  });

  it('não descreve torneios já iniciados ou datas inválidas', () => {
    expect(getTournamentStartLabel('2026-09-23', '2026-09-24')).toBeNull();
    expect(getTournamentStartLabel('24/09/2026', '2026-09-24')).toBeNull();
  });
});
