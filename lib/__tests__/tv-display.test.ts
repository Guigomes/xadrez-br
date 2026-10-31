import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tournament/tv-playback', async () => import('../tournament/tv-playback'));
vi.mock('@/lib/tournament/tv-presentation', async () => import('../tournament/tv-presentation'));
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
  it('offers the podium only with a finished-event slot and opens a direct ceremony link', () => {
    const $ = load(renderToStaticMarkup(React.createElement(TvDisplay, {
      header: 'Header', rounds: 'Mesas', standings: 'Ranking', podium: 'Cerimônia', initialMode: 'podium',
    })));
    expect($('select option[selected]').attr('value')).toBe('podium');
    expect($('[role="region"]').attr('aria-label')).toBe('Apresentação do pódio');
    expect($('[role="region"]').text()).toContain('Cerimônia');
    expect($('button').text()).toContain('Tela cheia');
    expect($('button').text()).not.toContain('Pausar apresentação');
  });
  it('ignores a podium initial mode without a finished-event slot', () => {
    const $ = load(renderToStaticMarkup(React.createElement(TvDisplay, { header: 'Header', rounds: 'Mesas', standings: 'Ranking', initialMode: 'podium' })));
    expect($('select option[value="podium"]')).toHaveLength(0);
    expect($('select option[selected]').attr('value')).toBe('round');
  });
  it('announces closure and displays standings until the next published round', () => {
    const $ = load(renderToStaticMarkup(React.createElement(TvDisplay, {
      header: 'Header', rounds: 'Mesas', standings: 'Ranking',
      roundState: { id: 'round', number: 2, status: 'finished', publishedAt: '2026-10-31T12:00:00Z' },
    })));
    expect($('select option[selected]').attr('value')).toBe('standings');
    expect($('select option[value="round"][disabled]')).toHaveLength(1);
    expect($('select option[value="alternate"][disabled]')).toHaveLength(1);
    expect($('section:not([hidden])').text()).toBe('Ranking');
    expect($('section[hidden]').text()).toBe('Mesas');
    expect($('[role="status"]').text()).toContain('Rodada 2 encerrada');
    expect($('[role="status"]').text()).toContain('até a próxima rodada ser publicada');
  });
  it('keeps an ongoing round visible and makes final-event messaging explicit', () => {
    const props = { header: 'Header', rounds: 'Mesas', standings: 'Ranking', roundState: {
      id: 'round', number: 3, status: 'ongoing' as const, publishedAt: '2026-10-31T12:00:00Z',
    } };
    const ongoing = load(renderToStaticMarkup(React.createElement(TvDisplay, props)));
    expect(ongoing('section:not([hidden])').text()).toBe('Mesas');
    expect(ongoing('[role="status"]').text()).not.toContain('encerrada');
    const final = load(renderToStaticMarkup(React.createElement(TvDisplay, {
      ...props, tournamentEnded: true, roundState: { ...props.roundState, status: 'finished' },
    })));
    expect(final('[role="status"]').text()).toContain('classificação final');
    expect(final('[role="status"]').text()).not.toContain('próxima rodada');
  });
});

describe('TV standings', () => {
  const row = (patch: Partial<TvStandingRow> = {}): TvStandingRow => ({
    tp_id: 'player', rank: 2, title: null, full_name: 'Miguel Oliveira Silva',
    fide_name: 'Silva, Miguel Oliveira', rating_tempo: 1835, points: 2.5, ...patch,
  });
  const render = (rows = [row()], groupName?: string, locale = 'pt-BR') =>
    load(renderToStaticMarkup(React.createElement(TvStandings, { rows, locale, groupName })));
  it('centers a width-limited table with breathing room on TV screens', () => {
    const $ = render();
    expect($('[data-tv-standings]').hasClass('mx-auto')).toBe(true);
    expect($('[data-tv-standings]').hasClass('max-w-5xl')).toBe(true);
    expect($('[data-tv-standings]').hasClass('lg:px-8')).toBe(true);
    expect($('[data-tv-standings] table')).toHaveLength(1);
  });
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
