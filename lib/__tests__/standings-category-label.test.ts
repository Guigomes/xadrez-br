import React, { type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StandingRow } from '../../types/database';

const mocks = vi.hoisted(() => ({ standings: [] as StandingRow[], search: '' }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: PropsWithChildren<{ href: string; className?: string }>) => React.createElement('a', props, children),
  usePathname: () => '/torneios/teste/classificacao',
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR' }));
vi.mock('@/lib/hooks/use-tournament', () => ({
  useTournament: () => ({ data: { id: 'tournament', status: 'ongoing' }, isLoading: false }),
  useTournamentStandings: () => ({ data: mocks.standings, isLoading: false }),
  useTournamentRounds: () => ({ data: [] }),
  useGroupHasResults: () => ({ data: true }),
}));
vi.mock('@/lib/hooks/use-auth', () => ({ useFollowedInTournament: () => ({ data: undefined }) }));
vi.mock('@/lib/hooks/use-tournament-group-preference', async () => import('../hooks/use-tournament-group-preference'));
vi.mock('@/components/tournament/standings-table', async () => import('../../components/tournament/standings-table'));
vi.mock('@/components/ui/spinner', () => ({ PageSpinner: () => null }));
vi.mock('@/components/ui/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/ui/whatsapp-button', () => ({ WhatsAppButton: () => null }));
vi.mock('@/components/ui/search-field', () => ({ SearchField: () => null }));
vi.mock('@/components/tournament/tiebreak-legend-button', () => ({ TiebreakLegendButton: () => null }));
vi.mock('@/components/player/origin-badge', () => ({ OriginBadge: () => React.createElement('span', {}, 'MS') }));
vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
vi.mock('@/lib/utils/player-name', async () => import('../utils/player-name'));
vi.mock('@/lib/utils/player-title', async () => import('../utils/player-title'));
vi.mock('@/lib/utils/federation', async () => import('../utils/federation'));
vi.mock('@/lib/utils/rounds', async () => import('../utils/rounds'));
vi.mock('@/lib/utils/whatsapp', async () => import('../utils/whatsapp'));
vi.mock('@/lib/utils/text', async () => import('../utils/text'));
vi.mock('@/lib/utils/standings-state', async () => import('../utils/standings-state'));
import { StandingsTable } from '../../components/tournament/standings-table';
import { StandingsView } from '../../components/tournament/standings-view';

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

describe('pairing group selector in standings', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    mocks.standings = rows;
    mocks.search = '';
  });
  afterEach(() => vi.unstubAllGlobals());
  const view = () => load(renderToStaticMarkup(React.createElement(StandingsView, { slug: 'teste' })));

  it('hides the selector for a single group without losing its players or category filters', () => {
    const $ = view();
    expect($('select')).toHaveLength(0);
    expect($('tbody a')).toHaveLength(2);
    expect($('button').map((_, el) => $(el).text()).get()).toEqual(['Absoluto', 'Sub-10', 'Sub-12']);
  });

  it('also hides the selector when the standings have no pairing groups', () => {
    mocks.standings = rows.map(row => ({ ...row, pairing_group_id: null, pairing_group_name: null }));
    const $ = view();
    expect($('select')).toHaveLength(0);
    expect($('tbody a')).toHaveLength(2);
  });

  it('shows distinct pairing groups and preserves the selected group from the URL', () => {
    mocks.standings = [rows[0], { ...rows[1], pairing_group_id: 'second', pairing_group_name: 'Outro grupo' }];
    mocks.search = 'group=second';
    const $ = view();
    expect($('select')).toHaveLength(1);
    expect($('select option')).toHaveLength(2);
    expect($('option[selected]').attr('value')).toBe('second');
    expect($('tbody a').map((_, el) => $(el).text()).get()).toEqual(['Beatriz Souza']);
  });
});
