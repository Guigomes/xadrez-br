'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ImportResult {
  matched: number;
  unmatched: number;
  unmatchedPlayers: string[];
}

export function ImportStandings({ slug }: { slug: string }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const queryClient = useQueryClient();

  async function handleImport() {
    if (!url.trim()) return;
    setStatus('loading');
    setResult(null);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/import-standings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Erro ao importar.'); setStatus('error'); return; }
      setResult(data);
      setStatus('success');
      setUrl('');
      queryClient.invalidateQueries({ queryKey: ['tournament', slug] });
    } catch {
      setErrorMsg('Erro de rede. Tente novamente.');
      setStatus('error');
    }
  }

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Importar classificação</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Cole o link de download do Chess-Results para atualizar a classificação.
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="https://chess-results.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={status === 'loading'}
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
        />
        <Button onClick={handleImport} loading={status === 'loading'} disabled={!url.trim()}>
          Importar
        </Button>
      </div>

      {status === 'success' && result && (
        <div className="mt-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-3 text-sm">
          <p className="font-medium text-green-800 dark:text-green-300">
            ✓ Classificação atualizada — {result.matched} jogador{result.matched !== 1 ? 'es' : ''} importado{result.matched !== 1 ? 's' : ''}.
          </p>
          {result.unmatched > 0 && (
            <div className="mt-1 text-green-700 dark:text-green-400">
              <p>{result.unmatched} não encontrado{result.unmatched !== 1 ? 's' : ''}:</p>
              <ul className="list-disc list-inside mt-0.5 text-xs space-y-0.5">
                {result.unmatchedPlayers.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-400">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
