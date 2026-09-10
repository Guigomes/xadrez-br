'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function PayRegistrationButton({ registrationId }: { registrationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePay() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/registrations/${registrationId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.invoiceUrl) throw new Error(body.error ?? 'Não foi possível iniciar o pagamento.');
      window.location.assign(body.invoiceUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o pagamento.');
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <Button size="sm" loading={loading} onClick={handlePay}>Pagar inscrição</Button>
      {error && <p className="mt-1 max-w-56 text-xs text-red-600">{error}</p>}
    </div>
  );
}
