import React, { type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  user: { id: 'viewer' } as { id: string; is_anonymous?: boolean } | null,
  allowed: false, accessError: false, historyError: null as unknown,
  history: vi.fn(), access: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({ Link: ({ children, ...props }: PropsWithChildren<{ href: string }>) => React.createElement('a', props, children) }));
vi.mock('@/lib/hooks/use-player', () => ({
  usePlayer: () => ({ data: { full_name: 'Jogador', rating_rpd: 1700, cbx_id: '123' } }),
  usePlayerTournaments: () => ({ data: [{ id: 'participant', current_rank: 1, current_score: 2, tournament: { name: 'Torneio público', slug: 'publico', status: 'finished', start_date: '2026-11-01' } }] }),
}));
vi.mock('@/lib/hooks/use-auth', () => ({
  useUser: () => ({ user: m.user, loading: false }),
  usePlayerFollow: () => ({ user: m.user, isFollowing: false, toggleFollow: { mutate: vi.fn(), isPending: false } }),
}));
vi.mock('@/lib/hooks/use-player-history-access', () => ({ usePlayerHistoryAccess: (viewer: string | undefined) => {
  m.access(viewer);
  return { data: { allowed: m.allowed, enforced: true, offer: { code: 'player', price_cents: 499, currency: 'BRL', billing_interval: 'month' } }, isLoading: false, isError: m.accessError, refetch: vi.fn() };
} }));
vi.mock('@/lib/hooks/use-player-history', () => ({ usePlayerHistory: (...args: unknown[]) => {
  m.history(...args);
  // Simulate React Query still returning previously cached paid history while disabled.
  return { data: [{ source: 'history', game_id: 'cached', tournament_id: 'old', tournament_slug: 'antigo', tournament_name: 'Torneio antigo', start_date: '2025-01-01', color: 'white', opponent_name: 'Adversário do histórico completo', result: '1-0' }], isLoading: false, error: m.historyError, refetch: vi.fn() };
} }));
vi.mock('@/lib/player-history/types', async () => import('../player-history/types'));
vi.mock('@/lib/billing/organizer', async () => import('../billing/organizer'));
vi.mock('@/lib/billing/player-history', async () => import('../billing/player-history'));
vi.mock('@/components/player-history/player-history-view', () => ({ PlayerHistoryView: ({ games }: { games: { opp: { name: string } }[] }) => React.createElement('div', { 'data-history': true }, games.map((g) => g.opp.name).join()) }));
vi.mock('@/components/player-history/player-insights', () => ({ PlayerInsights: () => React.createElement('div', { 'data-insights': true }, 'Desempenho completo') }));
vi.mock('@/components/ui/spinner', () => ({ PageSpinner: () => null }));
vi.mock('@/components/ui/share-button', () => ({ ShareButton: () => null }));
vi.mock('@/components/ui/empty-state', () => ({ EmptyState: ({ title }: { title: string }) => React.createElement('p', {}, title) }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: PropsWithChildren) => React.createElement('span', {}, children) }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children }: PropsWithChildren) => React.createElement('button', {}, children) }));
vi.mock('@/lib/utils/chess', () => ({ getTournamentStatusColor: () => '', getTournamentStatusLabel: () => 'Encerrado', formatScore: (v: number) => String(v) }));
vi.mock('@/lib/utils/date', () => ({ formatDate: () => '01/11/2026' }));
import { PlayerProfileView } from '../../components/player-history/player-profile-view';

describe('full history paywall', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('React', React);
    m.user = { id: 'viewer' }; m.allowed = false; m.accessError = false; m.historyError = null;
  });
  afterEach(() => vi.unstubAllGlobals());
  const render = () => load(renderToStaticMarkup(React.createElement(PlayerProfileView, { id: 'player' })));
  it('keeps the basic profile/public tournament links but never renders cached subscriber history to free accounts', () => {
    const $ = render();
    expect($.text()).toContain('Jogador'); expect($.text()).toContain('1700');
    expect($('a[href="/torneios/publico/jogadores/participant"]')).toHaveLength(1);
    expect($.text()).toMatch(/R\$\s*4,99\/mês/);
    expect($('a[href="/planos"]')).toHaveLength(1);
    expect($('[data-history],[data-insights]')).toHaveLength(0);
    expect($.text()).not.toContain('Adversário do histórico completo');
    expect(m.history).toHaveBeenCalledWith('player', false, 'viewer');
  });
  it('enables history only for the current authorized viewer', () => {
    m.allowed = true;
    const $ = render(); expect($('[data-history]')).toHaveLength(1);
    expect($.text()).toContain('Adversário do histórico completo');
    expect(m.history).toHaveBeenCalledWith('player', true, 'viewer');
    expect($('a[href="/planos"]')).toHaveLength(0);
  });
  it.each([null, { id: 'anonymous', is_anonymous: true }])('requires registered login before checking paid access %j', (user) => {
    m.user = user; m.allowed = true;
    const $ = render();
    expect($('[data-history]')).toHaveLength(0);
    expect($('a[href="/entrar"]')).not.toHaveLength(0);
    expect(m.history).toHaveBeenCalledWith('player', false, undefined);
    expect(m.access).toHaveBeenCalledWith(undefined);
  });
  it('shows retry instead of a misleading upsell on verification failure', () => {
    m.accessError = true; m.allowed = true;
    const $ = render(); expect($('[role="alert"]').text()).toContain('Tentar novamente');
    expect($('[data-history]')).toHaveLength(0); expect($('a[href="/planos"]')).toHaveLength(0);
  });
  it('honors a server denial after an access check or downgrade, not the cached response', () => {
    m.allowed = true; m.historyError = { code: '42501', message: 'PLAYER_HISTORY_SUBSCRIPTION_REQUIRED' };
    const $ = render(); expect($('[data-history]')).toHaveLength(0);
    expect($('a[href="/planos"]')).toHaveLength(1);
  });
});
