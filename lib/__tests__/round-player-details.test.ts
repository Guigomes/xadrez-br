import React, { type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundPairingRow, Tournament } from '../../types/database';

const mocks = vi.hoisted(() => ({
  pairings: [] as RoundPairingRow[], search: 'round=round', limit: 1,
  rounds: [{ id: 'round', round_number: 1, status: 'ongoing', published_at: '2026-10-31T00:00:00Z' }],
  groups: [{ id: 'group', name: 'Absoluto', rounds_count: 1 }],
  generate: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, ...props }: PropsWithChildren<{ href: string; className?: string }>) => React.createElement('a', props, children),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR' }));
vi.mock('@/lib/hooks/use-native-rounds', () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useGroups: () => ({ data: mocks.groups }),
    useGroupRounds: () => ({ data: mocks.rounds }),
    useCreateDefaultGroup: mutation, useGenerateRound: () => ({ ...mutation(), mutateAsync: mocks.generate }), useRoundTransition: mutation,
    useReturnRoundToDraft: mutation, useOverridePairing: mutation, useToggleRequestedBye: mutation,
    usePairingHistory: () => ({ data: [] }), useDraftWarnings: () => ({ data: [] }),
    useRequestedByes: () => ({ data: new Set() }),
  };
});
vi.mock('@/lib/hooks/use-tournament', () => ({
  useRoundPairings: () => ({ data: mocks.pairings }), useTournamentPlayers: () => ({ data: [] }),
}));
vi.mock('@/lib/hooks/use-player-history', () => ({ useLivePgnIds: () => ({ data: new Set() }) }));
vi.mock('@/components/tournament/pgn-attach', () => ({ PgnAttachButton: () => null }));
vi.mock('@/components/player-history/game-viewer', () => ({ GameViewerButton: () => null, RESULT_TEXT: {} }));
vi.mock('@/components/player/origin-badge', () => ({ FederationBadge: () => null }));
vi.mock('@/components/ui/button', async () => import('../../components/ui/button'));
vi.mock('@/components/ui/badge', async () => import('../../components/ui/badge'));
vi.mock('@/components/ui/modal', () => ({ Modal: () => null }));
vi.mock('@/components/ui/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/ui/spinner', () => ({ PageSpinner: () => null }));
vi.mock('@/components/ui/whatsapp-button', () => ({ WhatsAppButton: () => null }));
vi.mock('@/components/ui/search-field', () => ({ SearchField: () => null }));
vi.mock('@/components/tournament/piece-icons', async () => import('../../components/tournament/piece-icons'));
vi.mock('@/components/tournament/player-score-summary', async () => import('../../components/tournament/player-score-summary'));
vi.mock('@/lib/utils/cn', async () => import('../utils/cn'));
vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
vi.mock('@/lib/utils/player-name', async () => import('../utils/player-name'));
vi.mock('@/lib/utils/player-title', async () => import('../utils/player-title'));
vi.mock('@/lib/utils/whatsapp', async () => import('../utils/whatsapp'));
vi.mock('@/lib/utils/text', async () => import('../utils/text'));
vi.mock('@/lib/utils/rounds', async () => import('../utils/rounds'));
vi.mock('@/lib/utils/round-navigation', async () => import('../utils/round-navigation'));
vi.mock('@/lib/pairing/requested-bye', async () => import('../pairing/requested-bye'));
import { NativeRounds } from '../../components/admin/native-rounds';
import { PairingsList } from '../../components/tournament/pairings-list';

describe('player details on round lists', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    mocks.search = 'round=round'; mocks.limit = 1;
    mocks.generate.mockReset();
    mocks.groups = [{ id: 'group', name: 'Absoluto', rounds_count: 1 }];
    mocks.rounds = [{ id: 'round', round_number: 1, status: 'ongoing', published_at: '2026-10-31T00:00:00Z' }];
    mocks.pairings = [{
      pairing_id: 'game', board_number: 7, result: '1-0', is_bye: false, manual_override: false,
      white_tp_id: 'white', white_name: 'Vitor Gabriel Felix Vilela', white_rating: 2074,
      white_title: null, white_rank: null, white_score: 2.5, white_points: 1,
      black_tp_id: 'black', black_name: 'Royer Serafim Simon De Moura', black_rating: 1980,
      black_title: null, black_rank: null, black_score: 0, black_points: 0,
    }];
  });
  afterEach(() => vi.unstubAllGlobals());
  const native = () => React.createElement(NativeRounds, { tournament: {
    id: 'tournament', slug: 'teste', name: 'Torneio', status: 'ongoing', mode: 'native',
    rounds_count: mocks.limit, requested_bye_score: 0.5, tournament_type: 'swiss',
  } as Tournament });
  const publicView = () => React.createElement(PairingsList, { pairings: mocks.pairings, tournamentSlug: 'teste' });

  for (const [label, view] of [['organizer', native], ['public', publicView]] as const) {
    it(`${label} round list shows each player's current rating/points and the generated pieces`, () => {
      const $ = load(renderToStaticMarkup(view()));
      expect($('[data-player-score]').map((_, el) => $(el).text()).get()).toEqual(['Rating 2074 · 2½ pts', 'Rating 1980 · 0 pts']);
      expect($('img[src*="pawn-white-v1"]')).toHaveLength(1);
      expect($('img[src*="pawn-black-v1"]')).toHaveLength(1);
      expect($.text()).toContain('Vitor Gabriel Felix Vilela');
      expect($.text()).toContain('Royer Serafim Simon De Moura');
    });
    it(`${label} does not give a fake rating/total to the BYE opponent`, () => {
      Object.assign(mocks.pairings[0], { is_bye: true, result: 'bye', black_tp_id: null, black_name: 'BYE', black_rating: null, black_score: null });
      const $ = load(renderToStaticMarkup(view()));
      expect($('[data-player-score]')).toHaveLength(1);
      expect($('[data-player-score]').text()).toBe('Rating 2074 · 2½ pts');
    });
  }

  function betweenRounds(search: string) {
    mocks.search = search; mocks.limit = 6; mocks.groups[0].rounds_count = 6;
    mocks.rounds[0].status = 'finished';
    return load(renderToStaticMarkup(native()));
  }

  it('hides the finished board list and opens preparation for round 2 after finishing', () => {
    const $ = betweenRounds('group=group&prepare=2');
    expect($('[aria-label="Preparar rodada 2"]')).toHaveLength(1);
    expect($.text()).toContain('Gerar rodada 2 de 6');
    expect($.text()).not.toContain('Vitor Gabriel Felix Vilela');
    expect($('button[aria-pressed="true"]').text()).toBe('Preparar rodada 2');
    expect($('button').filter((_, el) => $(el).text() === 'Rodada 1')).toHaveLength(1);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('also defaults to the next preparation when reopening the round tab without a deep link', () => {
    const $ = betweenRounds('');
    expect($('button[aria-pressed="true"]').text()).toBe('Preparar rodada 2');
    expect($('[data-player-score]')).toHaveLength(0);
  });

  it('keeps the finished round available when explicitly selected', () => {
    const $ = betweenRounds('group=group&round=round');
    expect($.text()).toContain('Vitor Gabriel Felix Vilela');
    expect($('button[aria-pressed="true"]').text()).toBe('Rodada 1');
  });

  it('opens the new draft instead of a blank preparation after generating or reloading', () => {
    betweenRounds('group=group&prepare=2');
    mocks.rounds.push({ id: 'round2', round_number: 2, status: 'draft', published_at: '' });
    const $ = load(renderToStaticMarkup(native()));
    expect($('button[aria-pressed="true"]').text()).toBe('Rodada 2');
    expect($.text()).toContain('Publicar rodada');
    expect($.text()).toContain('Vitor Gabriel Felix Vilela');
  });

  it('restores the group from the finish redirect, not always the first group', () => {
    betweenRounds('group=second&prepare=2');
    mocks.groups.push({ id: 'second', name: 'Sub-10', rounds_count: 6 });
    const $ = load(renderToStaticMarkup(native()));
    expect($('button[aria-pressed="true"]').text()).toBe('Preparar rodada 2');
    expect($('[aria-label="Preparar rodada 2"]')).toHaveLength(1);
    expect($('button').filter((_, el) => $(el).text() === 'Sub-10').hasClass('bg-brand-600')).toBe(true);
    expect($('button').filter((_, el) => $(el).text() === 'Absoluto').hasClass('bg-brand-600')).toBe(false);
  });
});
