import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tournament/tv-playback', async () => import('../tournament/tv-playback'));
vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
vi.mock('@/lib/utils/player-name', async () => import('../utils/player-name'));
vi.mock('@/lib/utils/player-title', async () => import('../utils/player-title'));
import { TvDisplay } from '../../components/tournament/tv-display';
import { TvStandings, type TvStandingRow } from '../../components/tournament/tv-standings';

beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

describe('TV presentation shell', () => {
  it('offers three modes and a visible pause control, with round as the initial view', () => {
    const $ = load(renderToStaticMarkup(React.createElement(TvDisplay, {
      header: React.createElement('header', null, 'Torneio'), rounds: 'Mesas publicadas', standings: 'Classificação atual',
    })));
    expect($('label[for="tv-display-mode"]').text()).toBe('Exibir');
    expect($('select option').map((_, el) => $(el).attr('value')).get()).toEqual(['round', 'standings', 'alternate']);
    expect($('select option[selected]').attr('value')).toBe('round');
    expect($('button[aria-pressed="false"]').text()).toBe('Pausar apresentação');
    expect($('section:not([hidden])').text()).toBe('Mesas publicadas');
    expect($('section[hidden]').text()).toBe('Classificação atual');
    expect($('[role="region"]').attr('tabindex')).toBe('0');
    expect($('[role="region"]').attr('class')).toContain('overflow-y-auto');
    expect($('[role="region"] header')).toHaveLength(0);
    expect($('main header').text()).toBe('Torneio');
  });
});

describe('TV standings', () => {
  const row = (patch: Partial<TvStandingRow> = {}): TvStandingRow => ({
    tp_id: 'player', rank: 2, title: null, full_name: 'Miguel Oliveira Silva',
    fide_name: 'Silva, Miguel Oliveira', rating_tempo: 1835, points: 2.5, ...patch,
  });
  const render = (rows = [row()], groupName?: string, locale = 'pt-BR') =>
    load(renderToStaticMarkup(React.createElement(TvStandings, { rows, locale, groupName })));
  it('shows full names, server positions, tournament rating and current fractional points', () => {
    const $ = render();
    expect($('tbody th').text()).toContain('Miguel Oliveira Silva');
    expect($('tbody th').text()).toContain('Rating 1835');
    expect($('tbody td').first().text()).toBe('2');
    expect($('tbody td').last().text()).toBe('2½');
    expect($('.truncate')).toHaveLength(0);
  });
  it('does not invent missing ranks or ratings, and preserves real zero scores', () => {
    const $ = render([row({ rank: null, rating_tempo: null, points: 0 })]);
    expect($('tbody td').first().text()).toBe('—');
    expect($('tbody td').last().text()).toBe('0');
    expect($('tbody th').text()).toContain('Sem rating');
  });
  it('shows half a point without a leading zero', () => {
    expect(render([row({ points: 0.5 })])('tbody td').last().text()).toBe('½');
  });
  it('keeps source order/ties and identifies the group only in the heading', () => {
    const $ = render([row({ tp_id: 'second', full_name: 'Segundo', fide_name: null }), row({ tp_id: 'first', rank: 1, full_name: 'Primeiro', fide_name: null })], 'Sub-10');
    expect($('tbody th').first().text()).toContain('Segundo');
    expect($('tbody th').last().text()).toContain('Primeiro');
    expect($('tbody').text()).not.toContain('Sub-10');
    expect($('caption').text()).toContain('Sub-10');
  });
  it('uses the international display name and explains an empty ranking', () => {
    expect(render([row()], undefined, 'en')('tbody').text()).toContain('Silva, Miguel Oliveira');
    expect(render([])('body').text()).toContain('Aguardando participantes');
  });
});
