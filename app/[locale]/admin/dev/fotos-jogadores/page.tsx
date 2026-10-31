'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@/i18n/navigation';
import { useProfile } from '@/lib/hooks/use-auth';
import { usePlayerSearch, type PlayerSearchResult } from '@/lib/hooks/use-player';
import { playerPhotoFileError, type PlayerPhotoStatus } from '@/lib/player-photos/config';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function PlayerPhotosPage() {
  const { data: profile, isLoading } = useProfile();
  if (isLoading) return <PageSpinner />;
  if (profile?.role !== 'admin') return <EmptyState icon="🔒" title="Acesso restrito" description="Somente o Dev pode associar fotos aos jogadores." />;
  return <PhotoManager />;
}

function PhotoManager() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PlayerSearchResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const cache = useQueryClient();
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const players = usePlayerSearch(query);
  const statusKey = ['dev-player-photo', selected?.id] as const;
  const status = useQuery({
    queryKey: statusKey, enabled: !!selected,
    queryFn: async ({ signal }): Promise<PlayerPhotoStatus> => {
      const response = await fetch(`/api/admin/players/${selected!.id}/photo`, { signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível consultar a foto.');
      return body;
    },
    retry: false,
  });
  const upload = useMutation({
    mutationFn: async ({ playerId, photo }: { playerId: string; photo: File }): Promise<PlayerPhotoStatus> => {
      const form = new FormData(); form.set('photo', photo);
      const response = await fetch(`/api/admin/players/${playerId}/photo`, { method: 'PUT', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível salvar a foto.');
      return body;
    },
    onSuccess: async (data, variables) => {
      const key = ['dev-player-photo', variables.playerId];
      await cache.cancelQueries({ queryKey: key });
      cache.setQueryData(key, data);
      setFile(null); if (input.current) input.current.value = '';
      setMessage('Foto associada ao jogador. Ela poderá aparecer no pódio de torneios encerrados.');
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : 'Não foi possível salvar a foto.'),
  });
  function selectPlayer(player: PlayerSearchResult) {
    setSelected(player); setFile(null); setError(''); setMessage('');
    if (input.current) input.current.value = '';
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/admin/dev" className="text-sm text-brand-600 hover:underline dark:text-brand-400">← Painel Dev</Link>
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Fotos dos jogadores</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Uma foto por jogador, compartilhada entre os cadastros dele nos torneios. As fotos ficam privadas e só são exibidas no pódio de torneios encerrados.</p>
      </div>
      <div className="card space-y-3 p-4 sm:p-5">
        <Input label="Buscar jogador" placeholder="Nome, ID CBX ou ID FIDE" value={search} disabled={upload.isPending} onChange={(event) => setSearch(event.target.value)} />
        {query.length < 2 ? <p className="text-sm text-gray-500">Digite pelo menos 2 caracteres.</p>
          : players.isFetching ? <p role="status" className="text-sm text-gray-500">Buscando jogadores…</p>
          : players.isError ? <p role="alert" className="text-sm text-red-600">Não foi possível buscar jogadores. Tente novamente.</p>
          : !players.data?.length ? <p className="text-sm text-gray-500">Nenhum jogador encontrado.</p>
          : <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {players.data.map((player) => (
              <li key={player.id}>
                <button type="button" aria-pressed={selected?.id === player.id} disabled={upload.isPending} onClick={() => selectPlayer(player)}
                  className={`min-h-14 w-full rounded-lg p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50 ${selected?.id === player.id ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <span className="block break-words font-semibold text-gray-900 dark:text-gray-100">{player.title ? `${player.title} ` : ''}{player.full_name}</span>
                  <span className="mt-1 block text-xs text-gray-500">{[player.state, player.cbx_id ? `CBX ${player.cbx_id}` : null, player.fide_id ? `FIDE ${player.fide_id}` : null].filter(Boolean).join(' · ') || 'Sem IDs informados'}</span>
                </button>
              </li>
            ))}
          </ul>}
      </div>
      {selected && (
        <form className="card space-y-4 p-4 sm:p-5" onSubmit={(event) => {
          event.preventDefault(); setError(''); setMessage('');
          if (!file) { setError('Selecione uma foto.'); return; }
          const problem = playerPhotoFileError(file);
          if (problem) { setError(problem); return; }
          upload.mutate({ playerId: selected.id, photo: file });
        }}>
          <div>
            <h2 className="break-words font-bold text-gray-900 dark:text-gray-100">{selected.full_name}</h2>
            <p className="mt-1 break-all text-xs text-gray-500">Cadastro: {selected.id}</p>
          </div>
          {status.isPending ? <p role="status" className="text-sm text-gray-500">Consultando foto cadastrada…</p>
            : status.isError ? <div role="alert" className="space-y-2 text-sm text-red-600"><p>{status.error.message}</p><Button type="button" variant="secondary" onClick={() => status.refetch()}>Tentar novamente</Button></div>
            : <p className="text-sm text-gray-600 dark:text-gray-300">{status.data.hasPhoto ? 'Já existe uma foto associada. O envio substituirá a foto atual.' : 'Este jogador ainda não tem foto associada.'}</p>}
          <Input ref={input} label="Arquivo da foto" type="file" accept="image/jpeg,image/png,image/webp" disabled={upload.isPending || !status.isSuccess}
            hint="JPG, PNG ou WebP · até 3 MB e 25 megapixels. A imagem será otimizada e os metadados de localização removidos."
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); setMessage(''); }} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {message && <p role="status" className="text-sm text-green-700 dark:text-green-400">{message}</p>}
          <Button type="submit" loading={upload.isPending} disabled={!file || !status.isSuccess}>
            {status.data?.hasPhoto ? 'Substituir foto' : 'Associar foto'}
          </Button>
        </form>
      )}
    </div>
  );
}
