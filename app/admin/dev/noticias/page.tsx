'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/use-auth';
import { useAdminNewsList, useCreateNews } from '@/lib/hooks/use-news';
import { newsScopeLabel } from '@/lib/utils/news';
import { BR_STATES } from '@/lib/utils/chess';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import type { NewsScope } from '@/types/database';

export default function AdminNewsPage() {
  const { data: profile, isLoading: loadingProfile } = useProfile();

  if (loadingProfile) return <PageSpinner />;
  if (profile?.role !== 'admin') {
    return (
      <EmptyState icon="🔒" title="Acesso restrito"
        description="Este painel é exclusivo para administradores do sistema." />
    );
  }
  return <NewsPanel />;
}

function NewsPanel() {
  const { data: news, isLoading } = useAdminNewsList();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">📰 Notícias</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Publicação de conteúdo editorial. Rascunho fica invisível no site até você publicar.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Nova notícia</Button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !news?.length ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma notícia ainda.</p>
      ) : (
        <div className="card p-0 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          {news.map((n) => (
            <Link
              key={n.id}
              href={`/admin/dev/noticias/${n.id}`}
              className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    {newsScopeLabel(n.scope, n.state)}
                  </Badge>
                  <Badge className={n.status === 'published'
                    ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'}>
                    {n.status === 'published' ? 'Publicada' : 'Rascunho'}
                  </Badge>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                {n.published_at
                  ? `Publicada em ${new Date(n.published_at).toLocaleString('pt-BR')}`
                  : `Criada em ${new Date(n.created_at).toLocaleString('pt-BR')}`}
              </p>
            </Link>
          ))}
        </div>
      )}

      {creating && <CreateNewsModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/**
 * Só título + abrangência: a notícia nasce como rascunho e o resto (corpo,
 * capa, fonte) é editado na tela seguinte — o upload de capa precisa de um id
 * de notícia já existente pra montar o path no bucket.
 */
function CreateNewsModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateNews();
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<NewsScope>('national');
  const [state, setState] = useState('');
  const [error, setError] = useState('');

  function handleCreate() {
    setError('');
    if (!title.trim()) return setError('Informe o título.');
    if (scope === 'state' && !state) return setError('Escolha a UF da notícia estadual.');
    create.mutate(
      { title: title.trim(), scope, state: scope === 'state' ? state : null },
      {
        onSuccess: (data) => router.push(`/admin/dev/noticias/${data.id}`),
        onError: (err: any) => setError(err.message),
      },
    );
  }

  return (
    <Modal title="Nova notícia" onClose={onClose}>
      <div className="space-y-3">
        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        <Input label="Título *" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Abrangência *"
            value={scope}
            onChange={(e) => setScope(e.target.value as NewsScope)}
          >
            <option value="national">Nacional</option>
            <option value="state">Estadual</option>
            <option value="international">Internacional</option>
          </Select>
          {scope === 'state' && (
            <Select label="UF *" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Selecione…</option>
              {BR_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>)}
            </Select>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreate} loading={create.isPending} disabled={!title.trim()}>
            Criar rascunho
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  );
}
