-- ============================================================
-- Migration 058: ranking inicial nasce sozinho ao virar 'ongoing' — sem botão
-- ============================================================
-- Pedido do usuário: revisão de 057 — o gatilho não fica mais em "Encerrar
-- Inscrições", muda pra "Iniciar Torneio" (registration_closed -> ongoing),
-- e vale tanto pro clique manual (admin-tournament-chrome.tsx) quanto pra
-- transição automática por data (next_status_by_date, 040/043/045/047/056).
-- O botão "Gerar ranking inicial" (native-rounds.tsx) foi removido — não é
-- mais necessário. Rede de segurança pra quem gera rodada 1 sem nunca passar
-- por 'ongoing' (fluxo hoje permitido, ver e2e/tournament-lifecycle.spec.ts):
-- generateRoundDraft (lib/pairing/service.ts) semeia na hora, sozinho, se
-- achar o grupo sem seed.
--
-- Problema a resolver pra semear dentro de get_tournament_by_slug/
-- search_tournaments: as duas são security definer chamadas por QUALQUER
-- visitante (inclusive anônimo, sem organizador logado) — generate_initial_
-- ranking (020) checa is_tournament_manager(auth.uid()) e explode com
-- FORBIDDEN pra quem não é o organizador. Se isso rodasse ali dentro, um
-- visitante anônimo batendo na página pública no exato instante em que ALGUM
-- torneio de OUTRA pessoa vira 'ongoing' por data quebraria a página inteira
-- pra ele. Solução: extrai o corpo pra _generate_initial_ranking (interna,
-- sem checar permissão — seguro porque só é chamada por código de sistema:
-- a correção de status em si já não tem gate de permissão nenhum, mesmo
-- padrão). generate_initial_ranking continua existindo (só permissão + trava
-- de "congelado" + chama a interna), mas nada mais no app chama ela — só
-- fica de reserva caso precise mexer via SQL/admin dev no futuro.

create or replace function _generate_initial_ranking(p_group_id uuid)
returns void language plpgsql security definer as $$
declare
  v_group pairing_groups%rowtype;
  v_t     tournaments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 42));

  select * into v_group from pairing_groups where id = p_group_id;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  select * into v_t from tournaments where id = v_group.tournament_id;
  if exists (
    select 1 from rounds r
    where r.pairing_group_id = p_group_id and r.status <> 'draft'
  ) then
    raise exception 'INVALID_STATE: ranking inicial congelado (rodada já publicada)';
  end if;

  update tournament_players set initial_ranking = null
  where pairing_group_id = p_group_id;

  with seeded as (
    select tp.id,
      row_number() over (
        order by
          case v_t.rating_kind
            when 'std' then pl.rating_std
            when 'rpd' then pl.rating_rpd
            when 'blz' then pl.rating_blz
          end desc nulls last,
          pl.full_name asc
      ) as rn
    from tournament_players tp
    join players pl on pl.id = tp.player_id
    where tp.pairing_group_id = p_group_id and tp.status = 'active'
  )
  update tournament_players tp set initial_ranking = s.rn
  from seeded s where s.id = tp.id;

  perform _audit(v_t.id, 'generate_initial_ranking', 'pairing_group', p_group_id, null);
end $$;

create or replace function generate_initial_ranking(p_group_id uuid)
returns void language plpgsql security definer as $$
declare
  v_tournament_id uuid;
begin
  select tournament_id into v_tournament_id from pairing_groups where id = p_group_id;
  if v_tournament_id is null then raise exception 'GROUP_NOT_FOUND'; end if;
  if not is_tournament_manager(v_tournament_id) then raise exception 'FORBIDDEN'; end if;
  perform _generate_initial_ranking(p_group_id);
end $$;

-- ------------------------------------------------------------
-- get_tournament_by_slug: semeia todos os grupos do torneio quando o status
-- lido acabou de virar 'ongoing' por esta própria correção de data.
-- ------------------------------------------------------------
create or replace function get_tournament_by_slug(p_slug text)
returns tournaments language plpgsql security definer as $$
declare
  v_id uuid;
  v_status tournament_status;
  v_new_status tournament_status;
  v_created_by uuid;
  v_mode tournament_mode;
  v_gid uuid;
begin
  select id, status, created_by, mode into v_id, v_status, v_created_by, v_mode
  from tournaments where slug = p_slug;

  if v_id is null then return null; end if;

  if v_status = 'draft' and v_created_by is distinct from auth.uid() and auth_user_role() <> 'admin' then
    return null;
  end if;

  update tournaments t
  set status = next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time, t.created_at)
  where t.id = v_id
    and next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time, t.created_at) <> t.status
  returning t.status into v_new_status;

  if v_new_status = 'ongoing' and v_mode = 'native' then
    for v_gid in select id from pairing_groups where tournament_id = v_id loop
      if not exists (select 1 from rounds r where r.pairing_group_id = v_gid and r.status <> 'draft') then
        perform _generate_initial_ranking(v_gid);
      end if;
    end loop;
  end if;

  return (select t from tournaments t where t.id = v_id);
end $$;

-- ------------------------------------------------------------
-- search_tournaments: mesma ideia, em lote — só para os torneios que essa
-- própria chamada acabou de virar 'ongoing' (a maioria das leituras não
-- corrige nada, e esse loop não roda pra ninguém).
-- ------------------------------------------------------------
create or replace function search_tournaments(
  p_query  text    default null,
  p_state  text    default null,
  p_status tournament_status default null,
  p_limit  int     default 20,
  p_offset int     default 0
)
returns table (
  id                      uuid,
  slug                    text,
  name                    text,
  city                    text,
  state                   text,
  start_date              date,
  end_date                date,
  registration_end_date   date,
  status                  tournament_status,
  tournament_type         tournament_type,
  rounds_count            smallint,
  organizer_name          text,
  time_control            text,
  player_count            bigint
) language plpgsql security definer as $$
declare
  v_tid uuid;
  v_gid uuid;
begin
  for v_tid in
    with updated as (
      update tournaments t
      set status = next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time, t.created_at)
      where next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time, t.created_at) <> t.status
      returning t.id, t.status, t.mode
    )
    select u.id from updated u where u.status = 'ongoing' and u.mode = 'native'
  loop
    for v_gid in select id from pairing_groups where tournament_id = v_tid loop
      if not exists (select 1 from rounds r where r.pairing_group_id = v_gid and r.status <> 'draft') then
        perform _generate_initial_ranking(v_gid);
      end if;
    end loop;
  end loop;

  return query
  select
    t.id, t.slug, t.name, t.city, t.state,
    t.start_date, t.end_date, t.registration_end_date,
    t.status, t.tournament_type,
    t.rounds_count, t.organizer_name, t.time_control,
    count(tp.id)
  from tournaments t
  left join tournament_players tp on tp.tournament_id = t.id and tp.status = 'active'
  where t.is_public = true
    and t.status != 'draft'
    and (p_query  is null or t.name ilike '%' || p_query || '%' or t.city ilike '%' || p_query || '%')
    and (p_state  is null or lower(t.state) = lower(p_state))
    and (p_status is null or t.status = p_status)
  group by t.id
  order by t.start_date desc
  limit p_limit offset p_offset;
end;
$$;
