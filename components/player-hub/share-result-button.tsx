'use client';

import { Button } from '@/components/ui/button';

export function ShareResultButton({ tournamentPlayerId, playerName }: { tournamentPlayerId: string; playerName: string }) {
  const imageUrl = `/api/share/player/${tournamentPlayerId}`;
  async function share() {
    if (navigator.share) {
      await navigator.share({ title: `Resultado de ${playerName}`, text: 'Veja meu resultado no Torneios Xadrez BR', url: new URL(imageUrl, window.location.origin).toString() }).catch(() => undefined);
    } else {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  }
  return <Button variant="secondary" size="sm" onClick={share}>Compartilhar resultado</Button>;
}
