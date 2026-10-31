import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHESS_AND_KIDS_TOURNAMENT_ID, tournamentLogo } from '../tournament/branding';

vi.mock('@/lib/tournament/branding', async () => import('../tournament/branding'));
import { TournamentLogo } from '../../components/tournament/tournament-logo';

beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

describe('Chess And Kids event logo', () => {
  it('associates the uploaded artwork with the original event ID only', () => {
    expect(tournamentLogo(CHESS_AND_KIDS_TOURNAMENT_ID)).toEqual({ src: '/brands/chess-and-kids.jpg', alt: 'Logo Chess And Kids' });
    for (const other of [
      '01980ef8-a405-4bb5-b8bb-1550ed47ea00', // Manual 2 copy
      '253990f4-4823-442f-8741-0f49d23c8122', // Manual copy
      '0f6b3032-f9c6-4f9b-a1f1-b09ac7fde4fd', // Historical Chess And Kids event
      '2-torneio-interno-chess-and-kids--20261031', // Even the slug is not an ID
      'brasileiro-escolar-2026', '',
    ]) {
      expect(tournamentLogo(other)).toBeNull();
      expect(renderToStaticMarkup(React.createElement(TournamentLogo, { tournamentId: other }))).toBe('');
    }
  });
  it.each(['header', 'tv'] as const)('renders the complete logo with an accessible name in the %s size', (variant) => {
    const $ = load(renderToStaticMarkup(React.createElement(TournamentLogo, { tournamentId: CHESS_AND_KIDS_TOURNAMENT_ID, variant })));
    expect($('img')).toHaveLength(1);
    expect($('img').attr('alt')).toBe('Logo Chess And Kids');
    expect($('img').hasClass('object-contain')).toBe(true);
    expect($('img').hasClass('object-cover')).toBe(false);
    expect($('img').attr('sizes')).toContain(variant === 'tv' ? '96px' : '64px');
  });
  it('ships the actual JPEG as a tracked deploy asset, not an attachment path', () => {
    const bytes = readFileSync(new URL('../../public/brands/chess-and-kids.jpg', import.meta.url));
    expect(bytes[0]).toBe(0xff); expect(bytes[1]).toBe(0xd8);
  });
});
