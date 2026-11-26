import { describe, expect, it } from 'vitest';
import { tournamentRating } from '@/lib/utils/chess';

const player = { rating_std: 2033, rating_rpd: 1500, rating_blz: 1400 };

describe('tournamentRating', () => {
  it('importado usa o rating da época do torneio quando a fonte publicou', () => {
    expect(tournamentRating({ mode: 'imported', rating_kind: 'std' }, player, 2095)).toBe(2095);
    expect(tournamentRating({ mode: 'app', rating_kind: 'std' }, player, 1909)).toBe(1909);
  });
  it('sem rating da época, cai no cadastro (como antes)', () => {
    expect(tournamentRating({ mode: 'imported', rating_kind: 'rpd' }, player, null)).toBe(2033);
    expect(tournamentRating({ mode: 'imported', rating_kind: 'std' }, null, null)).toBeNull();
  });
  it('nativo ignora o rating da fonte e usa o ritmo do torneio', () => {
    expect(tournamentRating({ mode: 'native', rating_kind: 'rpd' }, player, 2095)).toBe(1500);
  });
});
