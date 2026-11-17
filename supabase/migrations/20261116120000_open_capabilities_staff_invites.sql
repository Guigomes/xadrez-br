-- ============================================================
-- Perfis abertos + convite de equipe por torneio (2026-11-16)
-- ============================================================
-- Decisão do dono: toda conta pode organizar e arbitrar. O que separa quem
-- faz o quê é o TORNEIO, não a conta:
--   * criar torneio: qualquer conta logada (o plano diz quantos, 073);
--   * arbitrar um torneio: só quem o organizador convidou E aceitou.
--
-- 1. Capacidades globais deixam de barrar. is_organizer_or_admin() e
--    is_arbiter_or_admin() passam a valer "está logado" (as policies de
--    players/tournaments/tournament_series continuam chamando os mesmos
--    nomes, sem precisar recriar nenhuma). As colunas is_organizer e
--    is_arbiter ficam no banco, sempre true, sem leitor no app.
--    is_participant continua: liga o preenchimento automático da inscrição
--    com os dados do perfil (027/028), não é permissão.
--
-- 2. tournament_staff ganha status: pending -> accepted | declined. Só o
--    aceito vira gestor (is_tournament_manager / is_tournament_organizer).
--    O convite é feito por invite_staff (RPC), que devolve se precisa
--    avisar a pessoa; o push sai pela rota POST /api/admin/tournaments/[slug]/staff.
--    Resposta por respond_staff_invite; pendentes por get_my_staff_invites.
--    add_staff_by_email continua (o site publicado antes do código novo ainda
--    chama): com o default 'pending' da coluna ele também só cria convite, sem
--    acesso. Sem leitor no código novo; pode sair numa migration futura.
--
-- A tabela tournament_staff estava vazia em produção no dia: nenhum
-- membro existente perde acesso. Mesmo assim, linhas antigas nascem
-- 'accepted' (default da coluna no ADD), e só depois o default vira 'pending'.
--
-- Idempotente.

-- ------------------------------------------------------------
-- 1. Capacidades abertas
-- ------------------------------------------------------------
update public.user_profiles
set is_organizer = true, is_arbiter = true
where not (is_organizer and is_arbiter);

create or replace function is_organizer_or_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select auth.uid() is not null;
$$;

create or replace function is_arbiter_or_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select auth.uid() is not null;
$$;

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into public.user_profiles (id, full_name, email, role, is_organizer, is_arbiter, is_participant)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'public_user',
    true,
    true,
    coalesce((new.raw_user_meta_data->>'is_participant')::boolean, false)
  );
  return new;
end;
$$;

-- Mesma assinatura (o app antigo em cache ainda manda os três), mas só
-- is_participant é escolha da pessoa.
create or replace function set_my_capabilities(p_is_organizer boolean, p_is_arbiter boolean, p_is_participant boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  update public.user_profiles
  set is_organizer = true, is_arbiter = true, is_participant = coalesce(p_is_participant, false)
  where id = auth.uid();
end $$;

-- ------------------------------------------------------------
-- 2. Convite de equipe
-- ------------------------------------------------------------
alter table public.tournament_staff
  add column if not exists status text not null default 'accepted';
alter table public.tournament_staff
  add column if not exists responded_at timestamptz;
alter table public.tournament_staff alter column status set default 'pending';

do $$ begin
  alter table public.tournament_staff
    add constraint tournament_staff_status_check
    check (status in ('pending', 'accepted', 'declined'));
exception when duplicate_object then null; end $$;

create index if not exists idx_staff_user_pending
  on public.tournament_staff (user_id) where status = 'pending';

-- Gestor = dono, admin ou membro que ACEITOU.
create or replace function is_tournament_manager(p_tournament_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament_id
      and (created_by = auth.uid() or auth_user_role() = 'admin')
  ) or exists (
    select 1 from public.tournament_staff s
    where s.tournament_id = p_tournament_id and s.user_id = auth.uid()
      and s.status = 'accepted'
  );
$$;

create or replace function is_tournament_organizer(p_tournament_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament_id
      and (created_by = auth.uid() or auth_user_role() = 'admin')
  ) or exists (
    select 1 from public.tournament_staff s
    where s.tournament_id = p_tournament_id
      and s.user_id = auth.uid() and s.role = 'organizer'
      and s.status = 'accepted'
  );
$$;

-- Escrita na tabela só pelas RPCs: a policy "for all" deixava o organizador
-- inserir o membro direto já com status 'accepted', pulando o convite.
drop policy if exists "tournament_staff: organizer manage" on public.tournament_staff;
drop policy if exists "tournament_staff: organizer select" on public.tournament_staff;
create policy "tournament_staff: organizer select"
  on public.tournament_staff for select
  using (is_tournament_organizer(tournament_id));
-- "tournament_staff: self select" (018/20261106120100) continua: o convidado
-- enxerga a própria linha, pendente ou não.

-- Lista da equipe com o status (colunas mudaram: drop + create).
drop function if exists get_tournament_staff(uuid);
create function get_tournament_staff(p_tournament_id uuid)
returns table (id uuid, user_id uuid, role staff_role, status text, full_name text, email text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select s.id, s.user_id, s.role, s.status, up.full_name, up.email
  from public.tournament_staff s
  join public.user_profiles up on up.id = s.user_id
  where s.tournament_id = p_tournament_id
    and is_tournament_manager(p_tournament_id)
  order by (s.status = 'accepted') desc, s.created_at;
$$;

-- Quem recusou pode ser convidado de novo; pendente e aceito não aparecem.
create or replace function search_staff_candidates(p_tournament_id uuid, p_query text)
returns table (id uuid, full_name text, email text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select up.id, up.full_name, up.email
  from public.user_profiles up
  where is_tournament_organizer(p_tournament_id)
    and length(btrim(coalesce(p_query, ''))) >= 3
    and (
      up.full_name ilike '%' || btrim(p_query) || '%'
      or up.email ilike '%' || btrim(p_query) || '%'
    )
    and not exists (
      select 1 from public.tournament_staff s
      where s.tournament_id = p_tournament_id and s.user_id = up.id
        and s.status in ('pending', 'accepted')
    )
    and up.id <> (select created_by from public.tournaments where id = p_tournament_id)
  order by up.full_name nulls last
  limit 10;
$$;

-- Convida (ou reconvida) por e-mail. notify = true quando a pessoa precisa
-- receber o aviso: convite novo, reenvio de pendente ou reconvite após recusa.
-- Membro que já aceitou só tem o papel trocado, sem novo aviso.
create or replace function invite_staff(p_tournament_id uuid, p_email text, p_role staff_role)
returns table (staff_id uuid, user_id uuid, notify boolean)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_row public.tournament_staff%rowtype;
  v_notify boolean;
begin
  if not is_tournament_organizer(p_tournament_id) then raise exception 'FORBIDDEN'; end if;

  select up.id into v_user from public.user_profiles up
  where lower(up.email) = lower(btrim(p_email)) limit 1;
  if v_user is null then
    raise exception 'USER_NOT_FOUND: nenhuma conta com este e-mail — peça para a pessoa criar conta primeiro';
  end if;
  if v_user = auth.uid() then
    raise exception 'SELF_INVITE: você já faz parte da equipe deste torneio';
  end if;
  if exists (select 1 from public.tournaments t where t.id = p_tournament_id and t.created_by = v_user) then
    raise exception 'OWNER: esta conta é a dona do torneio';
  end if;

  select * into v_row from public.tournament_staff s
  where s.tournament_id = p_tournament_id and s.user_id = v_user
  for update;

  if not found then
    insert into public.tournament_staff (tournament_id, user_id, role, invited_by, status)
    values (p_tournament_id, v_user, p_role, auth.uid(), 'pending')
    returning * into v_row;
    v_notify := true;
  elsif v_row.status = 'accepted' then
    update public.tournament_staff s set role = p_role where s.id = v_row.id;
    v_notify := false;
  else
    update public.tournament_staff s
    set role = p_role, invited_by = auth.uid(), status = 'pending',
        responded_at = null, created_at = now()
    where s.id = v_row.id;
    v_notify := true;
  end if;

  perform _audit(p_tournament_id, 'invite_staff', 'staff', v_row.id,
    jsonb_build_object('role', p_role, 'user', v_user, 'notify', v_notify));

  return query select v_row.id, v_user, v_notify;
end $$;

-- O convidado aceita ou recusa. Só a própria pessoa responde.
create or replace function respond_staff_invite(p_staff_id uuid, p_accept boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_row public.tournament_staff%rowtype;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  select * into v_row from public.tournament_staff s where s.id = p_staff_id for update;
  if not found then raise exception 'NOT_FOUND: convite não existe mais'; end if;
  if v_row.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_row.status <> 'pending' then
    raise exception 'INVALID_STATE: este convite já foi respondido';
  end if;

  update public.tournament_staff s
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where s.id = p_staff_id;

  perform _audit(v_row.tournament_id,
    case when p_accept then 'accept_staff_invite' else 'decline_staff_invite' end,
    'staff', p_staff_id, jsonb_build_object('role', v_row.role));
end $$;

-- Convites pendentes da conta logada (torneio privado incluso: o convidado
-- ainda não é gestor, então o RLS de tournaments não mostraria o nome).
create or replace function get_my_staff_invites()
returns table (
  id uuid, tournament_id uuid, tournament_name text, tournament_slug text,
  role staff_role, invited_by_name text, created_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select s.id, t.id, t.name, t.slug, s.role,
         coalesce(nullif(up.full_name, ''), up.email), s.created_at
  from public.tournament_staff s
  join public.tournaments t on t.id = s.tournament_id
  left join public.user_profiles up on up.id = s.invited_by
  where s.user_id = auth.uid() and s.status = 'pending'
  order by s.created_at desc;
$$;

-- Mesa só para quem está na equipe de fato (aceitou) ou é o dono.
create or replace function assign_board_arbiter(p_group_id uuid, p_board_number smallint, p_user_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_t uuid;
  v_existing uuid;
begin
  select tournament_id into v_t from pairing_groups where id = p_group_id;
  if v_t is null then raise exception 'GROUP_NOT_FOUND'; end if;
  if not is_tournament_manager(v_t) then raise exception 'FORBIDDEN'; end if;

  -- alvo precisa ser staff aceito (ou owner) do torneio
  if not (
    exists (select 1 from tournament_staff s
            where s.tournament_id = v_t and s.user_id = p_user_id and s.status = 'accepted')
    or exists (select 1 from tournaments t where t.id = v_t and t.created_by = p_user_id)
  ) then
    raise exception 'NOT_STAFF: usuário não faz parte do staff deste torneio';
  end if;

  select user_id into v_existing from board_arbiters
  where pairing_group_id = p_group_id and board_number = p_board_number;

  if not is_tournament_organizer(v_t) then
    -- árbitro: só auto-atribuição em mesa livre
    if p_user_id <> auth.uid() then raise exception 'FORBIDDEN: árbitro só assume mesa para si'; end if;
    if v_existing is not null then raise exception 'BOARD_TAKEN: mesa já tem árbitro'; end if;
  end if;

  insert into board_arbiters (tournament_id, pairing_group_id, board_number, user_id, assigned_by)
  values (v_t, p_group_id, p_board_number, p_user_id,
          case when p_user_id = auth.uid() then null else auth.uid() end)
  on conflict (pairing_group_id, board_number)
  do update set user_id = excluded.user_id, assigned_by = excluded.assigned_by, created_at = now();

  perform _audit(v_t, 'assign_board', 'board', null,
    jsonb_build_object('group', p_group_id, 'board', p_board_number, 'arbiter', p_user_id));
end $$;

revoke execute on function invite_staff(uuid, text, staff_role) from public, anon;
revoke execute on function respond_staff_invite(uuid, boolean) from public, anon;
revoke execute on function get_my_staff_invites() from public, anon;
grant execute on function invite_staff(uuid, text, staff_role) to authenticated, service_role;
grant execute on function respond_staff_invite(uuid, boolean) to authenticated, service_role;
grant execute on function get_my_staff_invites() to authenticated, service_role;
