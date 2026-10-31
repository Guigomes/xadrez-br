import React, { type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import type { StandingRow } from '../../types/database';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: PropsWithChildren<{ href: string; className?: string }>) => React.createElement('a', props, children),
}));
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR' }));
vi.mock('@/components/tournament/tiebreak-legend-button', () => ({ TiebreakLegendButton: () => null }));
vi.mock('@/components/player/origin-badge', () => ({ OriginBadge: () => React.createElement('span', {}, 'MS') }));
vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
vi.mock('@/lib/utils/player-name', async () => import('../utils/player-name'));
vi.mock('@/lib/utils/player-title', async () => import('../utils/player-title'));
import { StandingsTable } from '../../components/tournament/standings-table';

const rows: StandingRow[] = [
  {
    rank: 1, player_id: 'player1', tp_id: 'tp1', full_name: 'Ana Silva', fide_name: null,
    federation: 'BRA', state: 'MS', title: null, sex: 'w', rating_std: 1800, rating_tempo: 1900,
    initial_ranking: 1, points: 2.5, games_played: 3, wins: 2, draws: 1, losses: 0,
    buchholz: 5, buchholz_cut1: 3, sonneborn_berger: 4, progressive: 5, performance_rating: null,
    category_name: 'Sub-10', category_id: 'sub10', pairing_group_id: 'group',
    pairing_group_name: 'Absoluto', player_status: 'active',
  },
  {
    rank: 2, player_id: 'player2', tp_id: 'tp2', full_name: 'Beatriz Souza', fide_name: null,
    federation: 'BRA', state: 'MS', title: null, sex: 'w', rating_std: 1700, rating_tempo: 1800,
    initial_ranking: 2, points: 2, games_played: 3, wins: 2, draws: 0, losses: 1,
    buchholz: 4, buchholz_cut1: 2, sonneborn_berger: 3, progressive: 4, performance_rating: null,
    category_name: 'Sub-12', category_id: 'sub12', pairing_group_id: 'group',
    pairing_group_name: 'Absoluto', player_status: 'active',
  },
];

const render = (showCategory?: boolean, standings = rows, isInitialRanking = false) => load(renderToStaticMarkup(
  React.createElement(StandingsTable, {
    standings, tournamentSlug: 'teste', showCategory, isInitialRanking,
    followedPlayerIds: new Set(['player1']),
  }),
));

describe('category labels in standings', () => {
  it('preserves each category in the absolute ranking by default, including followed players', () => {
    const $ = render();
    expect($('tbody').text()).toContain('Sub-10');
    expect($('tbody').text()).toContain('Sub-12');
    expect($('[title="Acompanhando"]')).toHaveLength(1);
  });

  it.each([false, true])('omits redundant labels in a category ranking (initial=%s) without hiding player data', (initial) => {
    const $ = render(false, [rows[0], { ...rows[1], category_id: 'sub10', category_name: 'Sub-10' }], initial);
    expect($('tbody').text()).not.toContain('Sub-10');
    expect($('tbody a').map((_, el) => $(el).text()).get()).toEqual(['Ana Silva', 'Beatriz Souza']);
    expect($('tbody').text()).toContain('MS');
    expect($('tbody').text()).toContain('1900');
    expect($('thead').text().includes('Pts')).toBe(!initial);
    expect($('[title="Acompanhando"]')).toHaveLength(1);
    expect($('tbody a').first().attr('href')).toBe('/torneios/teste/jogadores/tp1?group=group');
  });

  it('can keep category labels in a transversal classification containing different subgroups', () => {
    const $ = render(true);
    expect($('tbody').text()).toContain('Sub-10');
    expect($('tbody').text()).toContain('Sub-12');
  });
});
