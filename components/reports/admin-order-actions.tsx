'use client';

import { useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

interface Props {
  orderId: string;
  status: string;
  /** Pedido liberado para entrega (pago ou gratuito, e não cancelado). */
  deliverable: boolean;
}

export function AdminOrderActions({ orderId, status, deliverable }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Falha na operação.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na operação.');
    } finally {
      setBusy(false);
    }
  }

  function setStatus(next: 'in_progress' | 'canceled') {
    return call(`/api/admin/reports/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
  }

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    return call(`/api/admin/reports/${orderId}/deliver`, { method: 'POST', body: form });
  }

  const closed = status === 'canceled';
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!closed && status !== 'delivered' && status !== 'in_progress' && deliverable && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus('in_progress')}>Marcar em produção</Button>
        )}
        {!closed && status !== 'delivered' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus('canceled')}>Cancelar</Button>
        )}
      </div>
      {!closed && deliverable && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="application/pdf" className="text-sm" />
          <Button size="sm" loading={busy} onClick={upload}>
            {status === 'delivered' ? 'Substituir PDF' : 'Entregar PDF'}
          </Button>
        </div>
      )}
      {!closed && !deliverable && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Entrega liberada só depois da confirmação do pagamento.</p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
