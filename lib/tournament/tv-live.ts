import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';

export type TvConnection = 'connecting' | 'live' | 'fallback';

/** Signals only invalidate server data. Never render or trust a Broadcast payload. */
export function subscribeToTvUpdates(
  client: Pick<SupabaseClient<Database>, 'channel' | 'removeChannel'>,
  tournamentId: string,
  refresh: () => void,
  onConnection: (state: TvConnection) => void,
) {
  let active = true;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  // Fixed coalescing window (not a trailing debounce): bulk imports cannot starve it.
  const requestRefresh = () => {
    if (!active || scheduled !== undefined) return;
    scheduled = setTimeout(() => {
      scheduled = undefined;
      if (active) refresh();
    }, 500);
  };

  const channel = client.channel(`tournament-tv:${tournamentId}`)
    .on('broadcast', { event: 'changed' }, requestRefresh)
    .subscribe((state) => {
      if (!active) return;
      onConnection(state === 'SUBSCRIBED' ? 'live' : 'fallback');
      // Covers changes between SSR and subscription, and missed events on reconnect.
      if (state === 'SUBSCRIBED') requestRefresh();
    });
  const timer = setInterval(requestRefresh, 20_000);

  return {
    requestRefresh,
    stop() {
      active = false;
      clearInterval(timer);
      clearTimeout(scheduled);
      void client.removeChannel(channel);
    },
  };
}
