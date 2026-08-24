-- ============================================================
-- Migration 071: get_tournament_page_data — 1 round-trip em vez de 4
-- ============================================================
-- app/tournaments/[slug]/layout.tsx roda em TODA navegação entre abas do
-- torneio (rota dinâmica por causa do client Supabase por cookie, sem cache
-- entre requests) e fazia até 4 queries SEQUENCIAIS em Node só pra montar o
-- cabeçalho/abas: get_tournament_by_slug -> tournament_imports -> rodada em
-- andamento -> contagem de pendências. Cada troca de aba pagava essa
-- cadeia inteira de novo, travando a tela até resolver (sem Suspense em
-- volta do próprio layout). Esta função replica a MESMA lógica (idêntica
-- linha a linha ao TS que ela substitui em layout.tsx) dentro do Postgres,
-- então vira 1 chamada só. Não mexe em get_tournament_by_slug em si (5
-- call sites já dependem do shape `tournaments` que ela devolve) — compõe
-- por cima dela.
create or replace function get_tournament_page_data(p_slug text)
returns table (
  tournament          tournaments,
  current_round_number int,
  effective_status     tournament_status,
  last_import_at       timestamptz,
  last_import_status   text
) language plpgsql security definer as $$
declare
  v_t tournaments%rowtype;
  v_round int;
  v_effective_status tournament_status;
  v_last_import_at timestamptz;
  v_last_import_status text;
  v_has_pending boolean;
begin
  select * into v_t from get_tournament_by_slug(p_slug);
  if v_t.id is null then
    return;
  end if;

  v_effective_status := v_t.status;

  select ti.last_run_at, ti.last_status into v_last_import_at, v_last_import_status
  from tournament_imports ti
  where ti.tournament_id = v_t.id and ti.last_run_at is not null
  order by ti.last_run_at desc
  limit 1;

  if v_t.status = 'ongoing' then
    -- Torneio com múltiplos grupos tem 1 linha de rodada por grupo, então
    -- várias podem estar 'ongoing' ao mesmo tempo — pega a de menor número
    -- (mesmo critério do TS original).
    select r.round_number into v_round
    from rounds r
    where r.tournament_id = v_t.id and r.status = 'ongoing'
    order by r.round_number
    limit 1;

    if v_round is not null then
      -- Banco diz que está em andamento — confirma checando se ainda há
      -- pareamento sem resultado ('*'). Sem pendência, é efetivamente
      -- encerrado mesmo com status desatualizado no banco (mesma
      -- verificação que o TS fazia, mas sem gravar de volta — cosmético).
      select exists(
        select 1 from pairings p
        where p.tournament_id = v_t.id and p.result = '*'
      ) into v_has_pending;

      if not v_has_pending then
        v_effective_status := 'finished';
        select r.round_number into v_round
        from rounds r where r.tournament_id = v_t.id
        order by r.round_number desc
        limit 1;
      end if;
    else
      select r.round_number into v_round
      from rounds r where r.tournament_id = v_t.id
      order by r.round_number desc
      limit 1;
    end if;
  end if;

  return query select v_t, v_round, v_effective_status, v_last_import_at, v_last_import_status;
end $$;
