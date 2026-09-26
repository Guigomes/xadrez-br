'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { describeUserAgent, getOrCreateDeviceId } from '@/lib/analytics/device';
import { getAllLocalFollowedPlayerIds } from '@/lib/utils/local-follows';

const RECENT_TRACK_KEY = 'gambito_last_tracked_path';
const DUPLICATE_WINDOW_MS = 2_000;

export function AccessTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    const syncDevice = (recordAccess: boolean) => {
      const deviceId = getOrCreateDeviceId();
      if (!deviceId) return;

      const device = describeUserAgent(window.navigator.userAgent);
      void fetch('/api/analytics/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          path: pathname,
          followedPlayerIds: [...getAllLocalFollowedPlayerIds()],
          recordAccess,
          ...device,
        }),
        keepalive: true,
      }).catch(() => undefined);
    };

    let recordAccess = true;
    // Evita a duplicação do efeito no Strict Mode sem transformar uma visita
    // futura ou um refresh real em acesso perdido.
    try {
      const previous = window.sessionStorage.getItem(RECENT_TRACK_KEY);
      if (previous) {
        const [previousPath, previousTime] = previous.split('|');
        recordAccess = previousPath !== pathname || Date.now() - Number(previousTime) >= DUPLICATE_WINDOW_MS;
      }
      if (recordAccess) window.sessionStorage.setItem(RECENT_TRACK_KEY, `${pathname}|${Date.now()}`);
    } catch {
      // O contador continua funcionando mesmo com sessionStorage bloqueado.
    }

    syncDevice(recordAccess);
    const syncFollows = () => syncDevice(false);
    window.addEventListener('xbr:follows:changed', syncFollows);
    return () => window.removeEventListener('xbr:follows:changed', syncFollows);
  }, [pathname]);

  return null;
}
