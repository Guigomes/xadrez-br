'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { NEWS_COVERS_BUCKET } from '@/lib/utils/news';
import type { News, NewsScope } from '@/types/database';
import type { NewsCardData } from '@/components/news/news-card';

const supabase = createClient();

export const newsKeys = {
  all:    ['news'] as const,
  public: (scope: string, state: string | null) => [...newsKeys.all, 'public', scope, state] as const,
  admin:  () => [...newsKeys.all, 'admin'] as const,
  detail: (id: string) => [...newsKeys.all, 'detail', id] as const,
};

export interface NewsFilter {
  /** 'all' = sem filtro de abrangência. */
  scope: NewsScope | 'all';
  /** UF — só usada quando scope='state'. */
  state: string | null;
}

const LIST_LIMIT = 20;

/**
 * Lista pública — a RLS (news_select_public, migration 059) já esconde
 * rascunho, então não precisa filtrar status aqui.
 */
export function useNewsList(filter: NewsFilter) {
  return useQuery({
    queryKey: newsKeys.public(filter.scope, filter.state),
    staleTime: 30_000,
    queryFn: async (): Promise<NewsCardData[]> => {
      // Só as colunas que NewsCard usa — a lista pode ter até 20 itens, cada
      // um carregando body_md inteiro à toa se pedisse a notícia completa.
      let query = supabase
        .from('news')
        .select('id, slug, cover_path, cover_alt, scope, state, published_at, title, summary')
        .order('published_at', { ascending: false })
        .limit(LIST_LIMIT);

      if (filter.scope !== 'all') query = query.eq('scope', filter.scope);
      if (filter.scope === 'state' && filter.state) query = query.eq('state', filter.state);

      const { data, error } = await query;
      if (error) throw error;
      // `scope` é `text` no banco (o CHECK que restringe os valores não vira
      // union type na geração automática) — a app é que sabe que só grava um
      // dos valores de NewsScope. Mesmo cast no ponto abaixo.
      return (data ?? []) as NewsCardData[];
    },
  });
}

/** Lista do painel — inclui rascunho (news_select_admin cobre isso). */
export function useAdminNewsList() {
  return useQuery({
    queryKey: newsKeys.admin(),
    queryFn: async (): Promise<News[]> => {
      const { data, error } = await supabase
        .from('news').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as News[];
    },
  });
}

export function useAdminNews(id: string) {
  return useQuery({
    queryKey: newsKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<News | null> => {
      const { data, error } = await supabase.from('news').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as News | null;
    },
  });
}

async function callApi(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar notícia.');
  return data;
}

export function useCreateNews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; scope: NewsScope; state: string | null }) =>
      callApi('/api/admin/news', 'POST', input) as Promise<{ id: string; slug: string }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: newsKeys.admin() }),
  });
}

export function useUpdateNews(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<News>) => callApi(`/api/admin/news/${id}`, 'PATCH', patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: newsKeys.detail(id) });
      qc.invalidateQueries({ queryKey: newsKeys.admin() });
    },
  });
}

export function useDeleteNews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callApi(`/api/admin/news/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: newsKeys.admin() }),
  });
}

/**
 * Sobe a capa pro bucket público. Path `<newsId>/<uuid>.<ext>` — mesmo padrão
 * do comprovante de pagamento (registration-form.tsx). Devolve só o path; a
 * URL pública é montada por newsCoverUrl() na hora de exibir.
 */
export function useUploadCover(newsId: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${newsId}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabase.storage
        .from(NEWS_COVERS_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (error) throw new Error(`Falha ao enviar imagem: ${error.message}`);
      return data.path;
    },
  });
}
