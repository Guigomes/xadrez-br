import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
import { PlayerScoreSummary } from '../../components/tournament/player-score-summary';
import { WhitePawn, BlackPawn } from '../../components/tournament/piece-icons';

describe('shared player rating and points', () => {
  beforeEach(() => vi.stubGlobal('React', React));
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    [1721, 0, 'Rating 1721 · 0 pts'], [1721, 0.5, 'Rating 1721 · ½ pts'],
    [1721, 1, 'Rating 1721 · 1 pt'], [1721, 3.5, 'Rating 1721 · 3½ pts'],
    [null, 2, 'Sem rating · 2 pts'], [0, 2, 'Sem rating · 2 pts'],
    [undefined, null, 'Sem rating · Pontos —'], [1980, undefined, 'Rating 1980 · Pontos —'],
  ] as const)('distinguishes rating %s and current score %s, including zero/missing values', (rating, score, expected) => {
    const $ = load(renderToStaticMarkup(React.createElement(PlayerScoreSummary, { rating, score })));
    expect($('[data-player-score]').text()).toBe(expected);
    expect($('[data-player-score]').attr('aria-label')).toBe('Rating e pontuação acumulada');
  });

  it.each([['white', WhitePawn], ['black', BlackPawn]] as const)('uses the matching %s transparent asset with optimized thumbnail sizes', (side, component) => {
    const $ = load(renderToStaticMarkup(React.createElement(component, { className: 'h-10 w-8' })));
    const img = $('img');
    expect(img.attr('src')).toContain(`pawn-${side}-v1.png`);
    expect(img.attr('srcset')).toBeTruthy();
    expect(img.attr('sizes')).toBe('48px');
    expect(img.attr('alt')).toBe('');
    expect(img.attr('aria-hidden')).toBe('true');
    expect(img.hasClass('object-cover')).toBe(true);
    // Both original assets must ship with the component, not remain outside Git.
    const png = readFileSync(new URL(`../../public/images/chess-pieces/pawn-${side}-v1.png`, import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1254);
    expect(png.readUInt32BE(20)).toBe(1254);
  });
});
