import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PodiumOption } from '../tournament/podium';

vi.mock('@/lib/utils/player-name', async () => import('../utils/player-name'));
vi.mock('@/lib/utils/player-title', async () => import('../utils/player-title'));
vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
vi.mock('@/lib/tournament/podium', async () => import('../tournament/podium'));
vi.mock('@/lib/tournament/podium-music', async () => import('../tournament/podium-music'));
vi.mock('../../components/tournament/tournament-logo', () => ({ TournamentLogo: () => null }));
import { TvPodium } from '../../components/tournament/tv-podium';

beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());
const options: PodiumOption[] = [{
  id: 'group:all', label: 'Absoluto', players: [1, 2, 3].map((position) => ({
    position, playerId: `player-${position}`, name: `Jogador Nome Completo ${position}`, fideName: null,
    title: null, points: 4 - position / 2,
  })),
}, { id: 'group:category:sub10', label: 'Sub-10', players: [] }];
const render = (choices = options) => load(renderToStaticMarkup(React.createElement(TvPodium, {
  options: choices, tournamentId: 'event', tournamentName: 'Torneio de encerramento', slug: 'test', locale: 'pt-BR',
})));

describe('podium presentation UI', () => {
  it('offers absolute/category selection and manual start/replay without autoplay on mount', () => {
    const $ = render();
    expect($('label[for="podium-category"]').text()).toBe('Pódio de');
    expect($('#podium-category option').map((_, option) => $(option).text()).get()).toEqual(['Absoluto', 'Sub-10']);
    expect($('button').map((_, button) => $(button).text()).get()).toEqual(['Iniciar apresentação', 'Mostrar pódio completo']);
    expect($('div[aria-hidden="true"]').filter((_, el) => $(el).text().includes('Jogador Nome Completo'))).toHaveLength(3);
    expect($('[role="status"]').text()).toContain('3º lugar');
  });
  it('places silver left, gold in the center and bronze right; preserves full names', () => {
    const $ = render();
    expect($('[role="group"] [aria-label$="lugar"]').map((_, element) => $(element).attr('aria-label')).get()).toEqual(['2º lugar', '1º lugar', '3º lugar']);
    expect($('[role="group"]').text()).toContain('Jogador Nome Completo 1');
    expect($('.truncate')).toHaveLength(0);
  });
  it('uses the existing pawn and scoped image endpoint, never a direct private bucket URL', () => {
    const $ = render();
    expect($('img[src*="pawn-white-v1"]')).toHaveLength(3);
    expect($('img[src*="/api/tournaments/test/podium-photo"]')).toHaveLength(3);
    expect($('img[src*="storage/v1"]')).toHaveLength(0);
  });
  it('handles missing awards without fabricating people', () => {
    expect(render([])('body').text()).toContain('Ainda não há classificação final');
    const $ = render([{ id: 'empty', label: 'Categoria', players: [] }]);
    expect($('button:not([disabled])')).toHaveLength(0);
    expect($('[role="status"]').text()).toContain('Não há posições finais confirmadas');
    expect($('[role="group"]')).toHaveLength(0);
    expect($('[aria-label$="lugar"]')).toHaveLength(0);
  });
  it.each([1, 2])('renders only the %i confirmed podium places without empty columns', (count) => {
    const $ = render([{ ...options[0], players: options[0].players.slice(0, count) }]);
    expect($('[role="group"] [aria-label$="lugar"]')).toHaveLength(count);
    expect($('[aria-label="3º lugar"]')).toHaveLength(0);
    expect($('[role="group"]').attr('style')).toContain(`grid-template-columns:repeat(${count}, minmax(0, 1fr))`);
    expect($('[role="status"]').text()).toContain(`pelo ${count}º lugar`);
    expect($('img[src*="pawn-white-v1"]')).toHaveLength(count);
  });
  it('preserves a real silver place without inventing gold or bronze', () => {
    const $ = render([{ ...options[0], players: [options[0].players[1]] }]);
    expect($('[role="group"] [aria-label$="lugar"]').attr('aria-label')).toBe('2º lugar');
    expect($('[aria-label="1º lugar"]')).toHaveLength(0);
    expect($('[aria-label="3º lugar"]')).toHaveLength(0);
  });
  it('keeps animations finite, honors reduced motion and never clips player names', () => {
    const css = readFileSync(new URL('../../components/tournament/tv-podium.module.css', import.meta.url), 'utf8');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).not.toContain('infinite');
    expect(css).toContain('overflow-wrap: anywhere');
  });
  it('offers both local music tracks without video, downloads or autoplay on initial render', () => {
    const $ = render();
    const music = $('[aria-label="Música do pódio"]');
    expect(music).toHaveLength(1);
    expect(music.is('details')).toBe(true);
    expect(music.attr('open')).toBeUndefined();
    expect($('#podium-music option[selected]').attr('value')).toBe('');
    expect($('#podium-music option').map((_, option) => $(option).text()).get()).toEqual([
      'Sem música', 'Take On Me · Brooklyn Duo', 'Trilha para apresentação · jv808tp',
    ]);
    expect(music.text()).toContain('Só este painel será afetado');
    expect($('audio, video, iframe, script[src*="youtube"]')).toHaveLength(0);
  });
});
