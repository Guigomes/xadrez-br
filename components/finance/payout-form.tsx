'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

/** Admin: registra um repasse ao organizador. Valor sugerido = saldo atual. */
export function PayoutForm({ slug, balanceCents }: { slug: string; balanceCents: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(balanceCents > 0 ? (balanceCents / 100).toFixed(2) : '');
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (cents > balanceCents && !window.confirm('O valor é maior que o saldo a repassar. Registrar mesmo assim?')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/tournaments/${slug}/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents, paidOn, method: 'pix', note }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Falha ao registrar o repasse.');
      setNote('');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao registrar o repasse.');
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-8 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 text-sm';
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <input className={`${field} w-28`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor do repasse em reais" required />
      <input className={field} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-label="Data do repasse" required />
      <input className={`${field} flex-1 min-w-[10rem]`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (ex.: comprovante)" aria-label="Observação" />
      <Button size="sm" type="submit" loading={busy}>Registrar repasse</Button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
