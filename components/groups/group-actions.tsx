'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { localizedTitle } from '@/lib/utils/player-title';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { usePlayerSearch } from '@/lib/hooks/use-player';
import { GROUP_KIND_LABEL, type GroupKind } from '@/lib/groups/overview';

async function send(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? 'Falha na operação.');
  return payload;
}

const field = 'h-10 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm';

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('club');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { id } = await send('/api/groups', 'POST', { name, kind });
      router.push(`/grupos/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar o grupo.');
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <input className={`${field} flex-1 min-w-[12rem]`} value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Nome (ex.: Clube de Xadrez da Escola X)" aria-label="Nome do grupo" required maxLength={80} />
      <select className={field} value={kind} onChange={(e) => setKind(e.target.value as GroupKind)} aria-label="Tipo de grupo">
        {(Object.keys(GROUP_KIND_LABEL) as GroupKind[]).map((k) => <option key={k} value={k}>{GROUP_KIND_LABEL[k]}</option>)}
      </select>
      <Button type="submit" loading={busy}>Criar grupo</Button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

export function AddMember({ groupId, memberIds }: { groupId: string; memberIds: string[] }) {
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data: results, isFetching } = usePlayerSearch(query);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function add(playerId: string) {
    setBusyId(playerId);
    setError('');
    try {
      await send(`/api/groups/${groupId}/members`, 'POST', { playerId });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao incluir.');
    } finally {
      setBusyId(null);
    }
  }
  return (
    <div className="space-y-2">
      <input className={`${field} w-full`} value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar jogador por nome, ID CBX ou FIDE" aria-label="Buscar jogador" />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {query.trim().length >= 2 && (
        <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
          {isFetching && !results?.length && <li className="px-3 py-2 text-sm text-gray-500">Buscando…</li>}
          {!isFetching && !results?.length && <li className="px-3 py-2 text-sm text-gray-500">Nenhum jogador encontrado.</li>}
          {(results ?? []).map((p) => {
            const already = memberIds.includes(p.id);
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {p.title ? `${localizedTitle(p.title, locale)} ` : ''}{p.full_name}
                  <span className="ml-1 text-xs text-gray-500">{[p.state, p.rating_std, p.cbx_id ? `CBX ${p.cbx_id}` : null].filter(Boolean).join(' · ')}</span>
                </span>
                <Button size="sm" variant="secondary" disabled={already || busyId === p.id} onClick={() => add(p.id)}>
                  {already ? 'No grupo' : 'Incluir'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MemberNote({ groupId, playerId, note }: { groupId: string; playerId: string; note: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      await send(`/api/groups/${groupId}/members`, 'PATCH', { playerId, note: text });
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-left text-xs text-gray-500 hover:text-brand-600 dark:text-gray-400">
        {note ? <span className="whitespace-pre-line">📝 {note}</span> : '+ anotação'}
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <textarea className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-sm" rows={3}
        value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Anotação privada sobre o jogador" />
      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={save}>Salvar</Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setText(note ?? ''); }}>Cancelar</Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function RemoveMember({ groupId, playerId, name }: { groupId: string; playerId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Tirar ${name} do grupo? A anotação sobre o jogador também será apagada.`)) return;
    setBusy(true);
    try {
      await send(`/api/groups/${groupId}/members`, 'DELETE', { playerId });
      router.refresh();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'Falha ao remover.');
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={remove} disabled={busy} className="text-xs text-gray-400 hover:text-red-600" aria-label={`Tirar ${name} do grupo`}>
      remover
    </button>
  );
}

export function DeleteGroup({ groupId, name }: { groupId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Excluir o grupo "${name}"? Os jogadores continuam no site; só o grupo e as anotações somem.`)) return;
    setBusy(true);
    try {
      await send('/api/groups', 'DELETE', { id: groupId });
      router.push('/grupos');
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'Falha ao excluir.');
      setBusy(false);
    }
  }
  return <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>Excluir grupo</Button>;
}
