'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/hooks/use-auth';
import {
  usePlanCatalog, useCreateSubscription, usePlanEntitlements, formatEntitlementLine,
  ENTITLEMENT_ORDER, type PlanOption,
} from '@/lib/hooks/use-plans';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function formatPrice(plan: PlanOption): string {
  if (!plan.price_cents) return 'Grátis';
  const value = (plan.price_cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: plan.currency || 'BRL',
  });
  const interval = plan.billing_interval === 'year' ? '/ano' : '/mês';
  return `${value}${interval}`;
}

export default function PlanosPage() {
  const { user } = useUser();
  const { data: plans, isLoading } = usePlanCatalog();
  const { data: entitlements } = usePlanEntitlements();
  const [openPlan, setOpenPlan] = useState<string | null>(null);

  if (isLoading) return <PageSpinner />;

  return (
    <div className="container-app py-8 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Planos</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Escolha o plano que combina com o tamanho do seu torneio.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {(plans ?? []).map((plan) => (
          <div key={plan.id} className="card p-5 flex flex-col gap-3">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{plan.name}</h2>
              {plan.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{plan.description}</p>
              )}
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatPrice(plan)}</p>

            <ul className="space-y-1.5 flex-1">
              {(entitlements ?? [])
                .filter((e) => e.plan_id === plan.id && e.enabled)
                .sort((a, b) => ENTITLEMENT_ORDER.indexOf(a.key) - ENTITLEMENT_ORDER.indexOf(b.key))
                .map((e) => (
                  <li key={e.key} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                    <span>{formatEntitlementLine(e.key, e.limit_int)}</span>
                  </li>
                ))}
            </ul>

            {plan.price_cents ? (
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
              <span className="text-xs text-gray-400">Plano atual sem custo.</span>
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
      <Button variant="secondary" onClick={() => router.push('/login')}>
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
