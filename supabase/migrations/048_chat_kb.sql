-- Chatbot de suporte — Fase 1: base de conhecimento indexada + busca semântica.
-- Ver docs/plano-chatbot-suporte.md. Chat é só pra usuário logado (decisão do
-- usuário) — por isso match_kb_chunks é restrita a `authenticated`, não `anon`.

create extension if not exists vector;

-- Base de conhecimento indexada (docs/kb/*.md, via scripts/index-kb.mjs).
-- embedding vector(512): voyage-4-lite com output_dimension=512 (decisão do
-- usuário — ver §4 do plano; modelo trocado de voyage-3-lite pra voyage-4-lite
-- em relação à proposta original, dimensão mantida em 512 via parâmetro).
create table if not exists kb_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_slug text not null,
  doc_title text not null,
  audience text not null default 'ambos',
  chunk_index int not null,
  content text not null,
  content_hash text not null,
  embedding vector(512),
  created_at timestamptz not null default now(),
  unique (doc_slug, chunk_index)
);

create index if not exists kb_chunks_embedding_idx
  on kb_chunks using hnsw (embedding vector_cosine_ops);

-- Sem policy de select: RLS habilitada e nenhuma policy permissiva = acesso
-- negado pra anon/authenticated. Só service_role (bypassa RLS) escreve via
-- scripts/index-kb.mjs; leitura só pela RPC abaixo.
alter table kb_chunks enable row level security;

create or replace function match_kb_chunks(
  query_embedding vector(512),
  match_count int default 5,
  min_similarity float default 0.3
) returns table (doc_slug text, doc_title text, content text, similarity float)
language sql stable security definer set search_path = public as $$
  select k.doc_slug, k.doc_title, k.content,
         1 - (k.embedding <=> query_embedding) as similarity
  from kb_chunks k
  where k.embedding is not null
    and 1 - (k.embedding <=> query_embedding) >= min_similarity
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

-- Restrição extra de defesa em profundidade: chat é só pra logado (decisão
-- do usuário), então a RPC nem deveria ser chamável por anon — mesmo que a
-- API route já barre isso antes de chegar aqui.
revoke execute on function match_kb_chunks(vector, int, float) from public;
grant execute on function match_kb_chunks(vector, int, float) to authenticated;
