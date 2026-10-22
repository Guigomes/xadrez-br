'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export interface OrderPlayerOption {
  id: string;
  name: string;
}

export interface OrderTournamentOption {
  /** Chave única da opção: "live:<id>" ou "history:<id>". */
  key: string;
  playerId: string;
  label: string;
}

interface Props {
  players: OrderPlayerOption[];
  tournaments: OrderTournamentOption[];
  /** Texto do preço já formatado ("Gratuito" ou "R$ 39,00"). */
  priceLabel: string;
  /** true = pedido cobrado; pede CPF/CNPJ e abre o checkout. */
  requiresPayment: boolean;
}

export function ReportOrderForm({ players, tournaments, priceLabel, requiresPayment }: Props) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState(players[0]?.id ?? '');
  const options = useMemo(() => tournaments.filter((t) => t.playerId === playerId), [tournaments, playerId]);
  const [tournamentKey, setTournamentKey] = useState('');
  const [consent, setConsent] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const selected = options.find((o) => o.key === tournamentKey) ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError('');
    setDone('');
    try {
      const [kind, id] = selected.key.split(':');
      const response = await fetch('/api/reports/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          tournamentId: kind === 'live' ? id : undefined,
          historyTournamentId: kind === 'history' ? id : undefined,
          guardianConsent: consent,
          cpfCnpj: requiresPayment ? cpfCnpj : undefined,
          billingType: 'UNDEFINED',
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível registrar o pedido.');
      if (body.invoiceUrl) {
        window.location.assign(body.invoiceUrl);
        return;
      }
      setDone('Pedido registrado! Você acompanha o andamento na lista abaixo.');
      setTournamentKey('');
      setConsent(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o pedido.');
    } finally {
      setLoading(false);
    }
  }

  if (!players.length) {
    return (
      <p className="rounded-lg bg-gray-50 dark:bg-gray-900 px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        Para pedir um relatório, vincule o cadastro do jogador à sua conta na Central do Jogador.
        O vínculo é confirmado por ID CBX ou FIDE, nunca só pelo nome.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {players.length > 1 && (
        <Select label="Jogador" value={playerId} onChange={(e) => { setPlayerId(e.target.value); setTournamentKey(''); }}>
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}
      {players.length === 1 && (
        <p className="text-sm text-gray-700 dark:text-gray-300">Jogador: <strong>{players[0].name}</strong></p>
      )}

      <Select label="Torneio" value={tournamentKey} onChange={(e) => setTournamentKey(e.target.value)} required>
        <option value="">{options.length ? 'Escolha o torneio…' : 'Nenhum torneio encontrado para este jogador'}</option>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </Select>

      {requiresPayment && (
        <Input label="CPF ou CNPJ (para a cobrança)" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)}
          inputMode="numeric" required />
      )}

      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          Autorizo a produção deste relatório com as partidas do jogador. Se o jogador for menor de idade,
          declaro ser o responsável legal e concordar com o uso dos dados da partida para esse fim.
        </span>
      </label>

      {error && <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {done && <p className="rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-400">{done}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={loading} disabled={!selected || !consent}>
          {requiresPayment ? 'Pedir e pagar' : 'Pedir relatório'}
        </Button>
        <span className="text-sm text-gray-500 dark:text-gray-400">{priceLabel}</span>
      </div>
    </form>
  );
}
