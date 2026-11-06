'use client';

import { Link } from '@/i18n/navigation';
import type { OrganizerSubscriptionStatus } from '@/lib/billing/organizer';

export function OrganizerSubscriptionNotice({ status, error, refresh }: {
  status?: OrganizerSubscriptionStatus; error?: Error | null; refresh: () => void;
}) {
  if (error) return (
    <div role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
      Não foi possível verificar a assinatura. Novos participantes ficam bloqueados até a consulta ser concluída.
      {' '}<button type="button" onClick={refresh} className="underline">Tentar novamente</button>
    </div>
  );
  if (!status?.enforced || status.exempt || status.subscribed) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="font-semibold">{status.playerCount} participantes · até {status.playerLimit} sem assinatura</p>
      <p className="mt-1">
        {status.canAddPlayer ? 'Para adicionar o 21º jogador, será necessária uma assinatura ativa de Organizador.' : 'Para adicionar ou aprovar mais jogadores, é necessária uma assinatura ativa de Organizador.'}
        {' '}O limite vale para o torneio inteiro, somando todos os grupos. Inscrições pendentes não entram na contagem.
      </p>
      {!status.isOwner && <p className="mt-1">A assinatura deve ser da conta responsável por este torneio. Peça ao responsável para assinar.</p>}
      <div className="mt-2 flex flex-wrap gap-4">
        {status.isOwner && <Link href="/planos" className="font-semibold underline">Ver assinatura de Organizador</Link>}
        <button type="button" onClick={refresh} className="underline">Já paguei · atualizar</button>
      </div>
    </div>
  );
}
