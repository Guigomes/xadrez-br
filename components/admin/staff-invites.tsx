'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useMyStaffInvites, useRespondStaffInvite } from '@/lib/hooks/use-staff';
import { Button } from '@/components/ui/button';
import { AccountPushToggle } from '@/components/notifications/account-push-toggle';

/**
 * Convites de equipe pendentes (migration 20261116120000). Fica no topo do
 * Painel, que é para onde o push do convite leva. Quem não ativou as
 * notificações também acha o convite aqui. Aceitar recarrega a página para
 * o torneio entrar na lista "Equipe".
 */
export function StaffInvites() {
  const router = useRouter();
  const { data: invites } = useMyStaffInvites();
  const respond = useRespondStaffInvite();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!invites?.length) return null;

  async function answer(staffId: string, accept: boolean) {
    setError('');
    setBusyId(staffId);
    try {
      await respond.mutateAsync({ staffId, accept });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível responder ao convite.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-6 space-y-3" aria-label="Convites para equipe">
      {invites.map((inv) => (
        <div
          key={inv.id}
          className="card border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"
        >
          <p className="text-sm text-gray-900 dark:text-gray-100">
            <span className="font-semibold">{inv.invited_by_name ?? 'Um organizador'}</span>
            {' convidou você para ser '}
            <span className="font-semibold">{inv.role === 'arbiter' ? 'árbitro' : 'organizador'}</span>
            {' do '}
            <span className="font-semibold">{inv.tournament_name}</span>.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {inv.role === 'arbiter'
              ? 'Ao aceitar, você poderá parear rodadas e lançar resultados deste torneio.'
              : 'Ao aceitar, você poderá gerenciar este torneio junto com o organizador.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={busyId === inv.id && respond.variables?.accept === true}
              disabled={busyId !== null}
              onClick={() => answer(inv.id, true)}
            >
              Aceitar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={busyId === inv.id && respond.variables?.accept === false}
              disabled={busyId !== null}
              onClick={() => answer(inv.id, false)}
            >
              Recusar
            </Button>
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {/* Some sozinho quando este aparelho já recebe os avisos da conta. */}
      <AccountPushToggle
        variant="prompt"
        promptText="Ative as notificações neste aparelho para receber os próximos convites na hora."
      />
    </section>
  );
}
