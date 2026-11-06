import React, { type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizerSubscriptionStatus } from '../billing/organizer';
vi.mock('@/i18n/navigation', () => ({ Link: ({ children, ...props }: PropsWithChildren<{ href: string }>) => React.createElement('a', props, children) }));
import { OrganizerSubscriptionNotice } from '../../components/admin/organizer-subscription-notice';

describe('organizer capacity notice', () => {
  const base: OrganizerSubscriptionStatus = { enforced: true, subscribed: false, exempt: false, playerCount: 20, playerLimit: 20, canAddPlayer: false, isOwner: true };
  beforeEach(() => vi.stubGlobal('React', React));
  afterEach(() => vi.unstubAllGlobals());
  const render = (status: OrganizerSubscriptionStatus = base, error?: Error) => load(renderToStaticMarkup(React.createElement(OrganizerSubscriptionNotice, { status, error, refresh: vi.fn() })));
  it('explains the full tournament limit and sends only the owner to subscribe', () => {
    const $ = render();
    expect($.text()).toContain('20 participantes');
    expect($.text()).toContain('somando todos os grupos');
    expect($.text()).toContain('Inscrições pendentes não entram');
    expect($('a[href="/planos"]')).toHaveLength(1);
    const staff = render({ ...base, isOwner: false });
    expect(staff('a')).toHaveLength(0);
    expect(staff.text()).toContain('Peça ao responsável para assinar');
  });
  it.each([{ subscribed: true }, { exempt: true }, { enforced: false }])('hides the upsell for %j', (patch) => {
    expect(render({ ...base, ...patch }).text()).toBe('');
  });
  it('offers a retry if status verification fails', () => {
    const $ = render(base, new Error('network failed'));
    expect($('[role="alert"]').text()).toContain('Novos participantes ficam bloqueados');
    expect($('button').text()).toBe('Tentar novamente');
  });
});
