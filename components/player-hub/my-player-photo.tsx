'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { playerPhotoFileError, type PlayerPhotoStatus } from '@/lib/player-photos/config';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Envio da foto pelo próprio jogador (ou responsável) na Minha área.
 * Só aparece para jogadores com vínculo verificado; a rota confere de novo.
 * Não mostra a imagem: a foto é privada e não tem URL.
 */
export function MyPlayerPhoto({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const cache = useQueryClient();
  const key = ['my-player-photo', playerId] as const;
  const url = `/api/me/players/${playerId}/photo`;

  const status = useQuery({
    queryKey: key,
    queryFn: async ({ signal }): Promise<PlayerPhotoStatus> => {
      const response = await fetch(url, { signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível consultar a foto.');
      return body;
    },
    retry: false,
  });
  const upload = useMutation({
    mutationFn: async (photo: File): Promise<PlayerPhotoStatus> => {
      const form = new FormData();
      form.set('photo', photo);
      form.set('consent', '1');
      const response = await fetch(url, { method: 'PUT', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível salvar a foto.');
      return body;
    },
    onSuccess: async (data) => {
      await cache.cancelQueries({ queryKey: key });
      cache.setQueryData(key, data);
      setFile(null);
      if (input.current) input.current.value = '';
      setMessage('Foto salva.');
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : 'Não foi possível salvar a foto.'),
  });

  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(''); setMessage('');
        if (!file) { setError('Selecione uma foto.'); return; }
        const problem = playerPhotoFileError(file);
        if (problem) { setError(problem); return; }
        if (!consent) { setError('Confirme a autorização de uso da foto.'); return; }
        upload.mutate(file);
      }}
    >
      <div>
        <h3 className="break-words font-semibold text-gray-900 dark:text-gray-100">{playerName}</h3>
        {status.isPending ? <p role="status" className="mt-1 text-sm text-gray-500">Consultando foto…</p>
          : status.isError ? <p role="alert" className="mt-1 text-sm text-red-600">{status.error.message}</p>
          : <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{status.data.hasPhoto ? 'Você já enviou uma foto. Um novo envio substitui a atual.' : 'Ainda sem foto.'}</p>}
      </div>
      <Input
        ref={input}
        label="Foto do jogador"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={upload.isPending || !status.isSuccess}
        hint="JPG, PNG ou WebP, até 3 MB. A imagem é otimizada e os dados de localização são removidos. A foto fica guardada de forma privada."
        onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); setMessage(''); }}
      />
      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={upload.isPending}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        Sou o jogador ou o responsável por ele e autorizo o Gambito a usar esta foto.
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      <Button type="submit" loading={upload.isPending} disabled={!file || !consent || !status.isSuccess}>
        {status.data?.hasPhoto ? 'Trocar foto' : 'Enviar foto'}
      </Button>
    </form>
  );
}
