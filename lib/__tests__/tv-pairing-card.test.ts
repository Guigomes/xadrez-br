import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundPairingRow } from '../../types/database';

vi.mock('@/lib/utils/player-title', async () => import('../utils/player-title'));
vi.mock('@/lib/utils/player-name', async () => import('../utils/player-name'));
vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
vi.mock('@/lib/tournament/tv-victory', async () => import('../tournament/tv-victory'));
import { TvPairingCard } from '../../components/tournament/tv-pairing-card';

describe('TV score cards', () => {
  it('declares the client boundary before imports so live hooks run in the browser', () => {
    const source = readFileSync(new URL('../../components/tournament/tv-pairing-card.tsx', import.meta.url), 'utf8');
    expect(source.trimStart().startsWith("'use client';")).toBe(true);
  });
  beforeEach(() => vi.stubGlobal('React', React));
  afterEach(() => vi.unstubAllGlobals());
  const pairing = (patch: Partial<RoundPairingRow> = {}): RoundPairingRow => ({
    pairing_id: 'game', board_number: 7, result: '*', is_bye: false, manual_override: false,
    white_tp_id: 'white', white_name: 'Vitor Gabriel Felix Vilela', white_fide_name: 'Vilela, Vitor Gabriel Felix', white_rating: null,
    white_title: null, white_rank: null, white_score: 0, white_points: null,
    black_tp_id: 'black', black_name: 'Royer Serafim Simon De Moura', black_rating: null,
    black_title: null, black_rank: null, black_score: 0, black_points: null,
    ...patch,
  });
  const render = (patch: Partial<RoundPairingRow> = {}, locale = 'pt-BR') =>
    load(renderToStaticMarkup(React.createElement(TvPairingCard, { pairing: pairing(patch), locale })));

  it('preserves full readable names and the board number without truncation', () => {
    const $ = render();
    expect($('article').text()).toContain('Mesa7');
    expect($('article').text()).toContain('Vitor Gabriel Felix Vilela');
    expect($('article').text()).toContain('Royer Serafim Simon De Moura');
    expect($('.truncate')).toHaveLength(0);
    expect($('.break-words')).toHaveLength(2);
    expect($('[aria-label="Resultado"]').text()).toContain('Em andamento');
    expect($('[aria-label="Vencedor"]')).toHaveLength(0);
  });

  it.each([
    ['1-0', 1, 0, '1 – 0', 1], ['0-1', 0, 1, '0 – 1', 1],
    ['1/2-1/2', 0.5, 0.5, '½ – ½', 0],
    ['forfeit_white', 0, 1, '0 – 1', 1], ['forfeit_black', 1, 0, '1 – 0', 1],
    ['double_forfeit', 0, 0, '0 – 0', 0],
  ] as const)('shows the committed %s score, winner and W.O. distinction', (result, white_points, black_points, score, winners) => {
    const $ = render({ result, white_points, black_points });
    expect($('[aria-label="Resultado"]').text()).toContain(score);
    expect($('[aria-label="Vencedor"]')).toHaveLength(winners);
    expect($('[aria-label="Resultado"]').text()).toContain(result.includes('forfeit') ? 'W.O.' : 'Finalizada');
  });

  it.each([0, 0.5, 1])('shows a bye with its actual %s points, not a fake opponent/victory', (points) => {
    const $ = render({ result: 'bye', is_bye: true, white_points: points, black_name: 'BYE', black_tp_id: null, board_number: null });
    expect($('article').text()).toContain('Bye ·');
    expect($('[aria-label="Pretas"]')).toHaveLength(0);
    expect($('[aria-label="Vencedor"]')).toHaveLength(0);
    expect($('.break-words')).toHaveLength(1);
  });

  it('distinguishes unpaired from an automatic bye', () => {
    expect(render({ result: 'not_paired', is_bye: true, white_points: 0 })('article').text()).toContain('Não emparceirado · 0 pontos');
  });

  it('respects international display names', () => {
    expect(render({}, 'en')('article').text()).toContain('Vilela, Vitor Gabriel Felix');
  });

  it('does not auto-celebrate existing victories on initial render or encode an endless animation', () => {
    const $ = render({ result: '1-0', white_points: 1, black_points: 0 });
    expect($('[data-tv-trophy]')).toHaveLength(1);
    expect($('[data-tv-victory-glow]').hasClass('opacity-0')).toBe(true);
    expect($('[data-tv-victory-glow]').attr('aria-hidden')).toBe('true');
    expect($('[class*="animate-"]')).toHaveLength(0);
    expect($('[data-tv-player="white"] [data-tv-trophy]')).toHaveLength(1);
    expect($('[data-tv-player="black"] [data-tv-trophy]')).toHaveLength(0);
  });
});
