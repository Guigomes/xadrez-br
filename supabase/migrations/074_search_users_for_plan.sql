-- ============================================================
-- Migration 074: busca de usuário pra tela de admin de planos
-- ============================================================
-- user_profiles tem RLS de self-read (mesmo motivo da 062,
-- search_staff_candidates) — .ilike() do client volta vazio pra qualquer um
-- que não seja a própria linha. Autocomplete de "trocar plano de quem"
-- precisa de RPC security definer gated por admin.
-- Idempotente.

create or replace function search_users_for_plan(p_query text)
returns table (
  id         uuid,
  full_name  text,
  email      text,
  plan_code  text,
  plan_name  text
) language sql stable security definer as $$
  select up.id, up.full_name, up.email, p.code, p.name
  from user_profiles up
  left join plans p on p.id = up.plan_id
  where auth_user_role() = 'admin'
    and length(btrim(coalesce(p_query, ''))) >= 3
    and (
      up.full_name ilike '%' || btrim(p_query) || '%'
      or up.email ilike '%' || btrim(p_query) || '%'
    )
  order by up.full_name nulls last
  limit 10;
$$;
