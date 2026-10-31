import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToTvUpdates } from '../tv-live';

describe('TV live updates', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    let changed = () => {};
    let status = (_state: string) => {};
    const channel = {
      on: vi.fn((_type, _filter, callback) => { changed = callback; return channel; }),
      subscribe: vi.fn((callback) => { status = callback; return channel; }),
    };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok') };
    const refresh = vi.fn();
    const connection = vi.fn();
    // Only the small surface used by the controller is mocked, not the SDK internals.
    const updates = subscribeToTvUpdates(client as unknown as Parameters<typeof subscribeToTvUpdates>[0], 'test-tournament', refresh, connection);
    return { channel, client, refresh, connection, updates, changed: () => changed(), status: (s: string) => status(s) };
  }

  it('subscribes only to invalidations for this tournament, not source tables or results', () => {
    const t = setup();
    expect(t.client.channel).toHaveBeenCalledWith('tournament-tv:test-tournament');
    expect(t.channel.on).toHaveBeenCalledWith('broadcast', { event: 'changed' }, expect.any(Function));
    t.updates.stop();
  });

  it('coalesces a bulk import into one refresh without waiting for the next poll', () => {
    const t = setup();
    for (let n = 0; n < 100; n++) t.changed();
    vi.advanceTimersByTime(499);
    expect(t.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.refresh).toHaveBeenCalledTimes(1);
    t.updates.stop();
  });

  it('continuous events cannot postpone refresh indefinitely', () => {
    const t = setup();
    for (let n = 0; n < 20; n++) { t.changed(); vi.advanceTimersByTime(100); }
    expect(t.refresh).toHaveBeenCalledTimes(4);
    t.updates.stop();
  });

  it('refreshes on subscription and reconnection to recover missed committed changes', () => {
    const t = setup();
    t.status('SUBSCRIBED');
    vi.advanceTimersByTime(500);
    expect(t.connection).toHaveBeenLastCalledWith('live');
    t.status('CHANNEL_ERROR');
    expect(t.connection).toHaveBeenLastCalledWith('fallback');
    t.status('SUBSCRIBED');
    vi.advanceTimersByTime(500);
    expect(t.refresh).toHaveBeenCalledTimes(2);
    t.updates.stop();
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])('keeps the 20s safety refresh after %s', (status) => {
    const t = setup();
    t.status(status);
    vi.advanceTimersByTime(20_500);
    expect(t.connection).toHaveBeenLastCalledWith('fallback');
    expect(t.refresh).toHaveBeenCalledTimes(1);
    t.updates.stop();
  });

  it('can immediately schedule recovery when the screen/network becomes available', () => {
    const t = setup();
    t.updates.requestRefresh();
    vi.advanceTimersByTime(500);
    expect(t.refresh).toHaveBeenCalledTimes(1);
    t.updates.stop();
  });

  it('removes its own channel/timers and ignores late callbacks after unmount', () => {
    const t = setup();
    t.changed();
    t.updates.stop();
    t.status('SUBSCRIBED');
    t.changed();
    vi.advanceTimersByTime(60_000);
    expect(t.refresh).not.toHaveBeenCalled();
    expect(t.connection).not.toHaveBeenCalled();
    expect(t.client.removeChannel).toHaveBeenCalledWith(t.channel);
    expect(vi.getTimerCount()).toBe(0);
  });
});
