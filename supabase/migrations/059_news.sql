-- ============================================================
-- Migration 059: notícias (conteúdo editorial público)
-- ============================================================
-- Seção /noticias: o site só tinha torneios e jogadores, sem lugar pra
-- divulgar resultado, aviso de federação ou matéria sobre evento — o conteúdo
-- acabava só em rede social externa. Publicação restrita a admin, pelo painel
-- dev (/admin/dev/noticias); leitura pública só do que está publicado.
--
-- Corpo em Markdown (body_md), renderizado sanitizado no cliente
-- (components/news/markdown.tsx) — nunca guardar HTML aqui.
--
-- Abrangência em DUAS colunas em vez de um enum único com as 27 UFs:
-- `scope` diz o tipo (estadual/nacional/internacional) e `state` guarda a UF
-- só quando faz sentido. Assim dá pra filtrar "todas as estaduais" sem listar
-- UF por UF, e a UF continua no mesmo domínio de tournaments.state
-- (BR_STATES, lib/utils/chess.ts). O check de coerência mora no banco porque
-- a rota de API não pode ser a única guarda disso.
--
-- Escrita sempre via createAdminClient() nas rotas de API (mesma convenção de
-- 053/055) — por isso não existe policy de insert/update/delete aqui.

create table if not exists news (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  summary       text,
  body_md       text not null default '',
  -- path no bucket news-covers, NÃO a URL (a URL pública é montada em
  -- lib/utils/news.ts — guardar URL quebraria se o projeto Supabase mudasse).
  cover_path    text,
  cover_alt     text,
  source_name   text,
  source_url    text,
  scope         text not null check (scope in ('state', 'national', 'international')),
  state         char(2),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  timestamptz,
  author_id     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint news_scope_state_coherent check (
    (scope = 'state' and state is not null)
    or (scope <> 'state' and state is null)
  )
);

-- O `unique` do slug já cria índice — não duplicar.
create index if not exists news_status_published_at_idx on news (status, published_at desc);
create index if not exists news_scope_state_idx on news (scope, state);

drop trigger if exists set_news_updated_at on news;
create trigger set_news_updated_at before update on news
  for each row execute function set_updated_at();

alter table news enable row level security;

-- As duas policies de select são permissivas e se somam (OR): o público vê só
-- o que está publicado, o admin vê tudo (inclusive rascunho, pro painel).
create policy "news_select_public" on news
  for select using (
    status = 'published' and published_at is not null and published_at <= now()
  );

create policy "news_select_admin" on news
  for select using (auth_user_role() = 'admin');

-- ============================================================
-- Bucket público das capas
-- ============================================================
-- Público (diferente de payment-receipts, migration 011) porque a capa
-- aparece pra visitante anônimo e entra em og:image — signed URL expira e
-- quebraria o preview em rede social. Limite de tamanho e MIME no próprio
-- bucket, como segunda barreira além da validação no formulário.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'news-covers', 'news-covers', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Sem policy de select: bucket público não passa por RLS na leitura.
create policy "news-covers: admin can upload"
  on storage.objects for insert
  with check (bucket_id = 'news-covers' and auth_user_role() = 'admin');

create policy "news-covers: admin can update"
  on storage.objects for update
  using (bucket_id = 'news-covers' and auth_user_role() = 'admin');

create policy "news-covers: admin can delete"
  on storage.objects for delete
  using (bucket_id = 'news-covers' and auth_user_role() = 'admin');
