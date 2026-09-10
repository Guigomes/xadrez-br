'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export function CheckinButton({ tournamentPlayerId }: { tournamentPlayerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function checkIn() {
    setLoading(true);
    setError('');
    const { error: rpcError } = await createClient().rpc('set_my_checkin', {
      p_tournament_player_id: tournamentPlayerId,
    });
    setLoading(false);
    if (rpcError) {
      const messages: Record<string, string> = {
        CHECKIN_NOT_OPEN: 'O check-in ainda não abriu.',
        CHECKIN_CLOSED: 'O prazo de check-in já encerrou.',
        CHECKIN_DISABLED: 'O check-in não está disponível.',
      };
      setError(Object.entries(messages).find(([key]) => rpcError.message.includes(key))?.[1] ?? 'Não foi possível confirmar presença.');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button size="sm" onClick={checkIn} loading={loading}>Confirmar presença</Button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
