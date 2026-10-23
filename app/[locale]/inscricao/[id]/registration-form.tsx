'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';

/**
 * Formulário público (sem conta). A inscrição vai para o celular do organizador, que aceita ou
 * recusa — por isso a mensagem final é "enviada", não "confirmada".
 */
export function RegistrationForm({ tournamentId }: { tournamentId: string }) {
  const [form, setForm] = useState({ name: '', birthYear: '', sex: '', club: '', rating: '', guardianName: '', contact: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/lite/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tournamentId, consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? 'Não foi possível enviar.');
      setSent(form.name.trim());
      setForm({ name: '', birthYear: '', sex: '', club: '', rating: '', guardianName: '', contact: form.contact, website: '' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="card space-y-3 p-6">
        <p className="font-semibold text-gray-900 dark:text-gray-100">Inscrição de {sent} enviada ✅</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          O organizador confere e confirma pelo app. Se precisar, ele fala com você pelo contato informado.
        </p>
        <Button variant="secondary" onClick={() => setSent(null)}>Inscrever outro jogador</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <Input label="Nome completo do jogador *" value={form.name} onChange={set('name')} required maxLength={120} autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Ano de nascimento" inputMode="numeric" value={form.birthYear} onChange={set('birthYear')} maxLength={4} placeholder="2015" hint="Define a categoria (Sub-10, Sub-12…)" />
        <div className="flex flex-col gap-1">
          <label htmlFor="sex" className="text-sm font-medium text-gray-700 dark:text-gray-300">Sexo</label>
          <select id="sex" value={form.sex} onChange={set('sex')} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            <option value="">Não informar</option>
            <option value="m">Masculino</option>
            <option value="w">Feminino</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Escola ou clube" value={form.club} onChange={set('club')} maxLength={120} />
        <Input label="Rating (se tiver)" inputMode="numeric" value={form.rating} onChange={set('rating')} maxLength={4} />
      </div>
      <Input label="Nome do responsável (para menores)" value={form.guardianName} onChange={set('guardianName')} maxLength={120} />
      <Input label="WhatsApp ou e-mail para contato *" value={form.contact} onChange={set('contact')} required maxLength={120} placeholder="(67) 99999-9999" hint="Só o organizador vê." />
      {/* Armadilha para robôs: escondido de pessoas. */}
      <input type="text" name="website" value={form.website} onChange={set('website')} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Sou o jogador ou o responsável por ele e concordo que estes dados sejam usados pelo organizador para a inscrição e a
          classificação do torneio (veja a <Link href="/privacidade" className="underline">política de privacidade</Link>).
        </span>
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" loading={sending} disabled={!consent || !form.name.trim() || !form.contact.trim()}>Enviar inscrição</Button>
    </form>
  );
}
