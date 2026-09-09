'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Checkout falso — só existe porque app/api/subscriptions/create devolve
// esta URL quando ASAAS_API_KEY não está configurada (lib/asaas/client.ts,
// modo mock). Aqui o "pagamento" é o próprio usuário clicando no botão, que
// chama app/api/mock/asaas-confirm — essa rota se recusa a rodar assim que
// uma ASAAS_API_KEY real existir, então esta tela nunca aparece em produção
// com conta configurada.

export default function MockCheckoutPage() {
  const params = useParams<{ subscriptionId: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleConfirm() {
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/mock/asaas-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: params.subscriptionId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Erro ao simular pagamento.');
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao simular pagamento.');
      setStatus('error');
    }
  }

  return (
    <div className="container-app py-12 max-w-md">
      <div className="card p-6 text-center space-y-4">
        <span className="inline-block rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-300">
          Checkout simulado — sem conta Asaas configurada
        </span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Confirmar assinatura</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Assinatura: <code className="text-xs">{params.subscriptionId}</code>
        </p>

        {status === 'done' ? (
          <>
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              ✓ Pagamento simulado confirmado — plano liberado.
            </p>
            <Button onClick={() => router.push('/account')}>Ir para minha conta</Button>
          </>
        ) : (
          <>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button onClick={handleConfirm} loading={status === 'loading'}>
              Simular pagamento confirmado
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
