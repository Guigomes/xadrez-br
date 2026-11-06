'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useUser } from '@/lib/hooks/use-auth';
import {
  useAvailablePlans, useCreateSubscription, usePlanEntitlements, formatEntitlementLine,
  ENTITLEMENT_ORDER, type PlanOption,
} from '@/lib/hooks/use-plans';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPlanPrice } from '@/lib/billing/organizer';

export default function PlanosPage() {
  const { user } = useUser();
  const { data: catalog, isLoading, error } = useAvailablePlans();
  const { data: entitlements } = usePlanEntitlements();
  const [openPlan, setOpenPlan] = useState<string | null>(null);

  if (isLoading) return <PageSpinner />;
  if (error) return <p role="alert" className="container-app py-8">Não foi possível carregar os planos. Tente novamente.</p>;

  return (
    <div className="container-app py-8 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Planos</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Escolha entre organizar torneios e consultar o histórico completo dos jogadores.
        {' '}Até 20 jogadores sem assinatura; acima disso, a conta responsável pelo torneio precisa de uma assinatura ativa de Organizador.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {(catalog?.plans ?? []).map((plan) => (
          <div key={plan.id} className="card p-5 flex flex-col gap-3">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{plan.name}</h2>
              {plan.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{!catalog?.globalBilling && plan.code === 'free' ? 'Organize torneios com até 20 jogadores, sem assinatura.' : plan.description}</p>
              )}
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatPlanPrice(plan)}</p>

            <ul className="space-y-1.5 flex-1">
              {(entitlements ?? [])
                .filter((e) => e.plan_id === plan.id && e.enabled && (catalog?.globalBilling || ['tournament.players', 'player.full_history'].includes(e.key)))
                .sort((a, b) => ENTITLEMENT_ORDER.indexOf(a.key) - ENTITLEMENT_ORDER.indexOf(b.key))
                .map((e) => (
                  <li key={e.key} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                    <span>{formatEntitlementLine(e.key, e.limit_int)}</span>
                  </li>
                ))}
            </ul>

            {plan.price_cents && plan.price_cents > 0 && plan.billing_interval ? (
              openPlan === plan.code ? (
                <SubscribeForm
                  plan={plan}
                  isLoggedIn={!!user}
                  onCancel={() => setOpenPlan(null)}
                />
              ) : (
                <Button variant="secondary" onClick={() => setOpenPlan(plan.code)}>
                  Assinar
                </Button>
              )
            ) : (
              <span className="text-xs text-gray-500">{plan.code === 'free' ? 'Sem cobrança até 20 jogadores por torneio.' : 'Contratação disponível assim que o preço for definido.'}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SubscribeForm({
  plan, isLoggedIn, onCancel,
}: { plan: PlanOption; isLoggedIn: boolean; onCancel: () => void }) {
  const router = useRouter();
  const createSubscription = useCreateSubscription();
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [error, setError] = useState('');

  if (!isLoggedIn) {
    return (
      <Button variant="secondary" onClick={() => router.push('/entrar')}>
        Entrar para assinar
      </Button>
    );
  }

  async function handleSubscribe() {
    setError('');
    if (!cpfCnpj.trim()) {
      setError('Informe seu CPF ou CNPJ.');
      return;
    }
    try {
      const result = await createSubscription.mutateAsync({ planCode: plan.code, cpfCnpj: cpfCnpj.trim() });
      if (result.invoiceUrl) {
        window.location.href = result.invoiceUrl;
      } else {
        setError('A cobrança foi criada, mas o link ainda não está disponível. Tente continuar novamente para recuperar a mesma cobrança.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar assinatura.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        label="CPF ou CNPJ"
        placeholder="Só números"
        value={cpfCnpj}
        onChange={(e) => setCpfCnpj(e.target.value)}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <Button onClick={handleSubscribe} loading={createSubscription.isPending}>
          Continuar
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}
