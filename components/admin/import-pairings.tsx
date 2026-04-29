'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface ImportResult {
  roundNumber: number;
  imported: number;
  unmatched: number;
  unmatchedPlayers: string[];
}

export function ImportPairings({ slug }: { slug: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const queryClient = useQueryClient();

  async function handleFile(file: File) {
    setStatus('loading');
    setResult(null);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/import-pairings`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Erro ao importar.');
        setStatus('error');
        return;
      }

      setResult(data);
      setStatus('success');
      queryClient.invalidateQueries({ queryKey: ['rounds', slug] });
      queryClient.invalidateQueries({ queryKey: ['tournament', slug] });
    } catch {
      setErrorMsg('Erro de rede. Tente novamente.');
      setStatus('error');
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Importar emparceiramentos</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Envie o arquivo .xlsx exportado pelo Chess-Results. O número da rodada é detectado automaticamente.
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === 'loading'}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {status === 'loading' ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Processando…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Selecionar arquivo
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {status === 'success' && result && (
        <div className="mt-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-3 text-sm">
          <p className="font-medium text-green-800 dark:text-green-300">
            ✓ Rodada {result.roundNumber} — {result.imported} emparceiramento{result.imported !== 1 ? 's' : ''} importado{result.imported !== 1 ? 's' : ''}.
          </p>
          {result.unmatched > 0 && (
            <div className="mt-1 text-green-700 dark:text-green-400">
              <p>{result.unmatched} jogador{result.unmatched !== 1 ? 'es' : ''} não encontrado{result.unmatched !== 1 ? 's' : ''}:</p>
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
