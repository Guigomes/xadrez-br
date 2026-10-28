'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { historyKeys, useGamePgn } from '@/lib/hooks/use-player-history';
import { MAX_PGN_CHARS } from '@/lib/pgn/normalize';

/**
 * Anexa (ou troca/remove) o PGN de uma mesa de torneio nativo — painel do organizador/árbitro.
 * Aceita colar o texto ou escolher o arquivo .pgn; a rota valida só o básico
 * (app/api/admin/tournaments/[slug]/pairings/[pairingId]/pgn). `hasPgn` vem da lista de mesas da
 * rodada (useLivePgnIds) para o botão já nascer certo sem buscar o texto.
 */
export function PgnAttachButton({
  slug, pairingId, hasPgn, boardLabel,
}: { slug: string; pairingId: string; hasPgn: boolean; boardLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
          hasPgn
            ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
      >
        {hasPgn ? '♟ Lances anexados — ver, trocar ou remover' : '♟ Anexar PGN da partida'}
      </button>
      {open && <PgnModal slug={slug} pairingId={pairingId} hasPgn={hasPgn} boardLabel={boardLabel} onClose={() => setOpen(false)} />}
    </>
  );
}

function PgnModal({
  slug, pairingId, hasPgn, boardLabel, onClose,
}: { slug: string; pairingId: string; hasPgn: boolean; boardLabel: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: current, isLoading } = useGamePgn('live', pairingId, hasPgn);
  const [text, setText] = useState<string | null>(null); // null = ainda não mexeu (mostra o atual)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const value = text ?? current ?? '';
  const url = `/api/admin/tournaments/${slug}/pairings/${pairingId}/pgn`;

  async function send(method: 'PUT' | 'DELETE') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'PUT' ? JSON.stringify({ pgn: value }) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível salvar o PGN.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...historyKeys.all, 'live-pgn-ids'] }),
        qc.invalidateQueries({ queryKey: historyKeys.pgn('live', pairingId) }),
      ]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar o PGN.');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_PGN_CHARS * 4) { setError('Arquivo grande demais para um PGN de uma partida.'); return; }
    setError('');
    setText(await file.text());
  }

  return (
    <Modal title={`PGN · ${boardLabel}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Cole o PGN da partida ou escolha o arquivo <code>.pgn</code>. Os lances aparecem para quem está logado,
          na lista da rodada e na ficha dos jogadores.
        </p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</p>}
        <textarea
          value={isLoading && text === null ? '' : value}
          onChange={(e) => setText(e.target.value)}
          placeholder={isLoading ? 'Carregando…' : '[White "…"]\n[Black "…"]\n\n1. e4 e5 2. Nf3 …'}
          rows={10}
          spellCheck={false}
          className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
        <input ref={fileRef} type="file" accept=".pgn,text/plain,application/x-chess-pgn" onChange={onFile} className="hidden" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => send('PUT')} loading={busy} disabled={!value.trim()}>Salvar PGN</Button>
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Escolher arquivo</Button>
          {hasPgn && (
            <Button type="button" variant="secondary" onClick={() => send('DELETE')} disabled={busy}>Remover</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
