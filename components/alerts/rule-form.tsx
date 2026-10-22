'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { TIME_CONTROL_LABEL, UFS, type TimeControl } from '@/lib/alerts/match';

export function AlertRuleForm({ disabledReason }: { disabledReason?: string | null }) {
  const router = useRouter();
  const [ufs, setUfs] = useState<string[]>([]);
  const [tcs, setTcs] = useState<TimeControl[]>([]);
  const [includeCbx, setIncludeCbx] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ufs, timeControls: tcs, includeCbx }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível criar o alerta.');
      setUfs([]);
      setTcs([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o alerta.');
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500'
        : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
    }`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Estados <span className="font-normal text-gray-500">(nenhum marcado = todos)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {UFS.map((uf) => (
            <button key={uf} type="button" aria-pressed={ufs.includes(uf)} className={chip(ufs.includes(uf))} onClick={() => setUfs(toggle(ufs, uf))}>
              {uf}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Ritmos <span className="font-normal text-gray-500">(nenhum marcado = todos)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TIME_CONTROL_LABEL) as TimeControl[]).map((tc) => (
            <button key={tc} type="button" aria-pressed={tcs.includes(tc)} className={chip(tcs.includes(tc))} onClick={() => setTcs(toggle(tcs, tc))}>
              {TIME_CONTROL_LABEL[tc]}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={includeCbx} onChange={(e) => setIncludeCbx(e.target.checked)} />
        Incluir o calendário oficial da CBX (além dos torneios do site)
      </label>
      {error && <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {disabledReason ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{disabledReason}</p>
      ) : (
        <Button type="submit" loading={busy}>Criar alerta</Button>
      )}
    </form>
  );
}

export function AlertRuleActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function call(method: 'PATCH' | 'DELETE', body: object) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/alerts/rules', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Falha ao atualizar o alerta.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar o alerta.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => call('PATCH', { id, active: !active })}>
        {active ? 'Pausar' : 'Reativar'}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => call('DELETE', { id })}>Excluir</Button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
