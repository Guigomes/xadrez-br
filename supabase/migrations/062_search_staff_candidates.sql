-- 062_search_staff_candidates.sql
-- Busca de candidatos a membro da equipe por nome OU e-mail (autocomplete a
-- partir do 3º caractere). user_profiles tem RLS de self-read (002), então a
-- busca precisa ser security definer e gated por organizador do torneio —
-- devolver o e-mail é intencional (o organizador confirma a pessoa certa e é
-- o e-mail que add_staff_by_email consome), e só chega a quem já administra.
-- Idempotente.

create or replace function search_staff_candidates(
  p_tournament_id uuid,
  p_query text
) returns table (id uuid, full_name text, email text)
language sql stable security definer as $$
  select up.id, up.full_name, up.email
  from user_profiles up
  where is_tournament_organizer(p_tournament_id)
    and length(btrim(coalesce(p_query, ''))) >= 3
    and (
      up.full_name ilike '%' || btrim(p_query) || '%'
      or up.email ilike '%' || btrim(p_query) || '%'
    )
    -- Exclui quem já é staff (inclusive o dono não faz sentido re-adicionar).
    and not exists (
      select 1 from tournament_staff s
      where s.tournament_id = p_tournament_id and s.user_id = up.id
    )
    and up.id <> (select created_by from tournaments where id = p_tournament_id)
  order by up.full_name nulls last
  limit 10;
$$;
