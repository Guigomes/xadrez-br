'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/use-auth';
import { useAdminNews, useUpdateNews, useDeleteNews, useUploadCover } from '@/lib/hooks/use-news';
import { newsCoverUrl, validateCoverFile, COVER_TYPES } from '@/lib/utils/news';
import { BR_STATES } from '@/lib/utils/chess';
import { Markdown } from '@/components/news/markdown';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { News, NewsScope } from '@/types/database';

interface Props {
  params: Promise<{ id: string }>;
}

export default function AdminNewsEditorPage({ params }: Props) {
  const { id } = use(params);
  const { data: profile, isLoading: loadingProfile } = useProfile();

  if (loadingProfile) return <PageSpinner />;
  if (profile?.role !== 'admin') {
    return (
      <EmptyState icon="🔒" title="Acesso restrito"
        description="Este painel é exclusivo para administradores do sistema." />
    );
  }
  return <NewsEditor id={id} />;
}

/** Campos editáveis — espelha o que a rota PATCH aceita. */
type Draft = Pick<News,
  'title' | 'slug' | 'summary' | 'body_md' | 'cover_path' | 'cover_alt' |
  'source_name' | 'source_url' | 'scope' | 'state'>;

function toDraft(n: News): Draft {
  return {
    title: n.title, slug: n.slug, summary: n.summary, body_md: n.body_md,
    cover_path: n.cover_path, cover_alt: n.cover_alt,
    source_name: n.source_name, source_url: n.source_url,
    scope: n.scope, state: n.state,
  };
}

function NewsEditor({ id }: { id: string }) {
  const router = useRouter();
  const { data: news, isLoading } = useAdminNews(id);
  const update = useUpdateNews(id);
  const remove = useDeleteNews();
  const uploadCover = useUploadCover(id);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Carrega o estado do formulário assim que a notícia chega (e só então —
  // o editor é totalmente controlado a partir daqui).
  useEffect(() => {
    if (news && !draft) setDraft(toDraft(news));
  }, [news, draft]);

  if (isLoading) return <PageSpinner />;
  if (!news) return <EmptyState icon="📰" title="Notícia não encontrada" />;
  if (!draft) return <PageSpinner />;

  const isPublished = news.status === 'published';
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function save(extra?: Record<string, unknown>) {
    setError('');
    update.mutate({ ...draft, ...extra } as any, {
      onSuccess: flash,
      onError: (err: any) => setError(err.message),
    });
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const invalid = validateCoverFile(file);
    if (invalid) return setError(invalid);
    try {
      const path = await uploadCover.mutateAsync(file);
      set('cover_path', path);
      // Grava já: o arquivo está no bucket, se o usuário sair sem salvar
      // viraria órfão sem nada apontando pra ele.
      update.mutate({ cover_path: path } as any, { onSuccess: flash });
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleDelete() {
    if (!window.confirm('Excluir esta notícia? A imagem de capa também será apagada. Não dá pra desfazer.')) return;
    remove.mutate(id, {
      onSuccess: () => router.push('/admin/dev/noticias'),
      onError: (err: any) => setError(err.message),
    });
  }

  const coverUrl = newsCoverUrl(draft.cover_path);
  const busy = update.isPending || uploadCover.isPending || remove.isPending;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/admin/dev/noticias" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
          ← Todas as notícias
        </Link>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-600 dark:text-green-400">✓ Salvo</span>}
          <Badge className={isPublished
            ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'}>
            {isPublished ? 'Publicada' : 'Rascunho'}
          </Badge>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="card p-5 space-y-4 mb-4">
        <Input label="Título *" value={draft.title} onChange={(e) => set('title', e.target.value)} />
        <Input
          label="Endereço (slug)"
          value={draft.slug}
          disabled={isPublished}
          onChange={(e) => set('slug', e.target.value)}
          hint={isPublished
            ? 'Travado depois de publicada — mudar quebraria os links já divulgados.'
            : `A notícia fica em /noticias/${draft.slug}`}
        />
        <Input
          label="Resumo"
          value={draft.summary ?? ''}
          onChange={(e) => set('summary', e.target.value)}
          hint="Aparece no card da lista e no preview de compartilhamento."
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Abrangência *"
            value={draft.scope}
            onChange={(e) => {
              const scope = e.target.value as NewsScope;
              setDraft((d) => (d ? { ...d, scope, state: scope === 'state' ? d.state : null } : d));
            }}
          >
            <option value="national">Nacional</option>
            <option value="state">Estadual</option>
            <option value="international">Internacional</option>
          </Select>
          {draft.scope === 'state' && (
            <Select label="UF *" value={draft.state ?? ''} onChange={(e) => set('state', e.target.value)}>
              <option value="">Selecione…</option>
              {BR_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>)}
            </Select>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-3 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Imagem de capa</h2>
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={draft.cover_alt ?? ''} className="max-h-56 rounded-lg object-cover" />
        )}
        <input
          type="file"
          accept={COVER_TYPES.join(',')}
          onChange={handleCoverChange}
          disabled={uploadCover.isPending}
          className="block w-full text-sm text-gray-600 dark:text-gray-400
            file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2
            file:text-sm file:font-medium file:text-brand-700
            dark:file:bg-brand-950/50 dark:file:text-brand-300"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">JPG, PNG ou WebP, até 5 MB.</p>
        <Input
          label="Texto alternativo da imagem"
          value={draft.cover_alt ?? ''}
          onChange={(e) => set('cover_alt', e.target.value)}
          hint="Descreve a imagem para quem usa leitor de tela."
        />
      </div>

      <div className="card p-5 space-y-3 mb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Texto</h2>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            {showPreview ? 'Voltar a editar' : 'Ver prévia'}
          </button>
        </div>
        {showPreview ? (
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <Markdown>{draft.body_md || '_(vazio)_'}</Markdown>
          </div>
        ) : (
          <textarea
            value={draft.body_md}
            onChange={(e) => set('body_md', e.target.value)}
            rows={16}
            placeholder={'Escreva em Markdown.\n\n## Subtítulo\n\nTexto com **negrito**, *itálico* e [link](https://exemplo.com).\n\n- item\n- item'}
            className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        )}
      </div>

      <div className="card p-5 space-y-3 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Fonte</h2>
        <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
          De onde veio a notícia — aparece no rodapé para dar o crédito.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Nome da fonte"
            value={draft.source_name ?? ''}
            onChange={(e) => set('source_name', e.target.value)}
            placeholder="Ex: CBX, FIDE, Federação Estadual"
          />
          <Input
            label="Link da fonte"
            value={draft.source_url ?? ''}
            onChange={(e) => set('source_url', e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save()} loading={update.isPending} disabled={busy}>
          Salvar
        </Button>
        {isPublished ? (
          <Button variant="secondary" disabled={busy} onClick={() => save({ status: 'draft' })}>
            Despublicar
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={() => save({ status: 'published' })}>
            Publicar
          </Button>
        )}
        {isPublished && (
          <Link
            href={`/noticias/${news.slug}`}
            target="_blank"
            className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            Ver no site ↗
          </Link>
        )}
        <Button variant="danger" className="ml-auto" disabled={busy} onClick={handleDelete}>
          Excluir
        </Button>
      </div>
    </div>
  );
}
