import React, { type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundPairingRow } from '../../types/database';
import type { ResultSubmission } from '../utils/round-results';

const mocks = vi.hoisted(() => ({
  pairings: [] as RoundPairingRow[], pending: [] as ResultSubmission[], status: 'ongoing',
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  use: () => ({ slug: 'teste', roundId: 'round' }),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, ...props }: PropsWithChildren<{ href: string; className?: string }>) => React.createElement('a', props, children),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { id: 'round', round_number: 1, pairing_group_id: 'group', status: mocks.status } }),
  useMutationState: () => mocks.pending,
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/hooks/use-tournament', () => ({
  useTournament: () => ({ data: { id: 'tournament', name: 'Torneio', created_by: 'user' }, isLoading: false }),
  useRoundPairings: () => ({ data: mocks.pairings, isLoading: false }),
}));
vi.mock('@/lib/hooks/use-native-rounds', () => ({
  useSetResult: () => ({ mutateAsync: vi.fn() }),
  useRoundTransition: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/hooks/use-staff', () => ({
  useMyTournamentRole: () => ({ data: 'organizer' }),
  useStaff: () => ({ data: [] }), useBoardArbiters: () => ({ data: [] }),
  useAssignBoard: () => ({ mutate: vi.fn(), isPending: false }),
  useUnassignBoard: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/hooks/use-auth', () => ({ useUser: () => ({ user: { id: 'user' } }) }));
vi.mock('@/components/ui/spinner', () => ({ PageSpinner: () => null }));
vi.mock('@/components/ui/button', async () => import('../../components/ui/button'));
vi.mock('@/components/ui/badge', async () => import('../../components/ui/badge'));
vi.mock('@/lib/utils/cn', async () => import('../utils/cn'));
vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
vi.mock('@/lib/utils/round-results', async () => import('../utils/round-results'));
vi.mock('@/lib/utils/round-navigation', async () => import('../utils/round-navigation'));
vi.mock('@/components/tournament/piece-icons', async () => import('../../components/tournament/piece-icons'));
vi.mock('@/components/tournament/player-score-summary', async () => import('../../components/tournament/player-score-summary'));
import ResultsPage from '../../app/[locale]/admin/torneios/[slug]/rodadas/[roundId]/resultados/page';

describe('result card hierarchy', () => {
  beforeEach(() => {
    // The project preserves JSX for Next; Vitest's classic JSX transform uses React.
    vi.stubGlobal('React', React);
    mocks.status = 'ongoing';
    mocks.pending = [];
    mocks.pairings = [{
      pairing_id: 'game', board_number: 7, result: '*', is_bye: false, manual_override: false,
      white_tp_id: 'white', white_name: 'Vitor Gabriel Felix Vilela', white_rating: null,
      white_title: null, white_rank: null, white_score: 0, white_points: null,
      black_tp_id: 'black', black_name: 'Royer Serafim Simon De Moura', black_rating: null,
      black_title: null, black_rank: null, black_score: 0, black_points: null,
    }];
  });
  afterEach(() => vi.unstubAllGlobals());

  const render = () => load(renderToStaticMarkup(React.createElement(ResultsPage, {
    params: Promise.resolve({ slug: 'teste', roundId: 'round' }),
  })));

  it('makes the board identifiable and shows both full names on separate larger rows', () => {
    const $ = render();
    expect($('h2').text()).toBe('Mesa 7');
    const players = $('.card [data-result-player]');
    expect(players).toHaveLength(2);
    expect(players.eq(0).text()).toContain('Brancas: Vitor Gabriel Felix Vilela');
    expect(players.eq(1).text()).toContain('Pretas: Royer Serafim Simon De Moura');
    expect(players.find('.break-words')).toHaveLength(2);
    expect(players.find('.truncate')).toHaveLength(0);
    expect(players.parent().attr('class')).not.toContain('sm:grid-cols');
  });

  it('asks who won and keeps three one-tap choices with smaller scores below', () => {
    const $ = render();
    const buttons = $('[aria-label="Resultado da mesa 7"] button');
    expect(buttons).toHaveLength(3);
    expect($('.card').text()).toContain('Quem venceu?');
    expect(buttons.map((_, element) => $(element).children().first().text()).get()).toEqual(['Brancas', 'Empate', 'Pretas']);
    expect(buttons.map((_, element) => $(element).children().last().text()).get()).toEqual(['1 – 0', '½ – ½', '0 – 1']);
    buttons.each((_, element) => {
      expect($(element).hasClass('min-h-14')).toBe(true);
      expect($(element).children().last().hasClass('text-xs')).toBe(true);
      expect($(element).hasClass('font-bold')).toBe(false);
    });
  });

  it.each(['1-0', '1/2-1/2', '0-1', 'forfeit_white', 'forfeit_black', 'double_forfeit'] as const)(
    'highlights only the selected %s control, not the card border', (result) => {
      mocks.pairings[0].result = result;
      const $ = render();
      expect($('.card [aria-pressed="true"]')).toHaveLength(1);
      expect($('.card .bg-green-600')).toHaveLength(1);
      expect($('.card').attr('class')).toBe('card p-4');
    },
  );

  it('keeps WO and clear visible as secondary controls without reducing touch targets', () => {
    const $ = render();
    const buttons = $('[aria-label="WO e correções da mesa 7"] button');
    expect(buttons.map((_, element) => $(element).text()).get()).toEqual(['WO pretas', 'WO brancas', 'WO duplo', 'Limpar']);
    buttons.each((_, element) => {
      expect($(element).hasClass('min-h-11')).toBe(true);
      expect($(element).hasClass('text-xs')).toBe(true);
      expect($(element).hasClass('border')).toBe(false);
    });
  });

  it('preserves optimistic feedback and prevents duplicate taps while saving', () => {
    mocks.pending = [{ pairingId: 'game', result: '0-1' }];
    const $ = render();
    expect($('.card [role="status"]').text()).toBe('Salvando…');
    expect($('.card [aria-pressed="true"]').text()).toBe('Pretas0 – 1');
    expect($('.card button[disabled]')).toHaveLength(7);
  });

  it('a finished round still prioritizes the players above its read-only result', () => {
    mocks.status = 'finished';
    mocks.pairings[0].result = '1/2-1/2';
    const $ = render();
    expect($('.card [data-result-player]')).toHaveLength(2);
    expect($('.card > p').text()).toBe('½ – ½');
    expect($('.card > p').hasClass('text-base')).toBe(true);
    expect($('.card button[aria-pressed]')).toHaveLength(0);
  });

  it('preserves the existing all/ongoing filter and its counts', () => {
    const $ = render();
    expect($('[aria-label="Filtrar mesas"]').text()).toContain('Todas (1)');
    expect($('[aria-label="Filtrar mesas"]').text()).toContain('Em andamento (1)');
  });

  it('shows current rating/points per player, not the points awarded by this game', () => {
    Object.assign(mocks.pairings[0], { result: '1-0', white_rating: 2074, white_score: 2.5, black_rating: 1980, black_score: 0 });
    const $ = render();
    expect($('[data-result-player="white"] [data-player-score]').text()).toBe('Rating 2074 · 2½ pts');
    expect($('[data-result-player="black"] [data-player-score]').text()).toBe('Rating 1980 · 0 pts');
    expect($('[data-result-player="white"] [aria-label="Vencedor"]').hasClass('text-2xl')).toBe(true);
    expect($('[data-result-player="white"] .font-bold')).toHaveLength(1);
    expect($('[data-result-player="black"] [aria-label="Vencedor"]')).toHaveLength(0);
  });

  it('uses the new optimized pawn images in player rows and winner buttons', () => {
    const $ = render();
    expect($('.card img[src*="pawn-white-v1"]')).toHaveLength(2);
    expect($('.card img[src*="pawn-black-v1"]')).toHaveLength(2);
  });
});
