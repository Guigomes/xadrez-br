-- RECUPERADA do registro do Supabase (supabase_migrations.schema_migrations) em 2026-10-24.
-- Esta migration já estava aplicada em produção mas não tinha arquivo neste repositório:
-- ela pertence ao app de transmissão de partidas ("Chess Match Film"), que usa o MESMO
-- banco do Gambito Torneios. O conteúdo abaixo é exatamente o que foi aplicado (versão 20260910231630).
-- Chess Match Film - reliable, code-scoped move broadcasts.
--
-- Forward rollout:
--   1. Deploy broadcast-view and the polling viewer.
--   2. Apply this migration.
--   3. Deploy the create/push/truncate function updates.
-- Existing broadcasts and moves are preserved throughout.

drop policy if exists "broadcasts are publicly readable" on public.broadcasts;
drop policy if exists "broadcast_moves are publicly readable" on public.broadcast_moves;

revoke all on table public.broadcasts from anon, authenticated;
revoke all on table public.broadcast_moves from anon, authenticated;
revoke all on table public.broadcast_keys from anon, authenticated;

grant select, insert, update, delete on table public.broadcasts to service_role;
grant select, insert, update, delete on table public.broadcast_moves to service_role;
grant select, insert, update, delete on table public.broadcast_keys to service_role;

create table if not exists public.broadcast_create_limits (
  fingerprint text not null,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (fingerprint, window_start)
);

alter table public.broadcast_create_limits enable row level security;
revoke all on table public.broadcast_create_limits from anon, authenticated;
grant select, insert, update, delete on table public.broadcast_create_limits to service_role;

create or replace function public.claim_broadcast_create_slot(
  p_fingerprint text,
  p_limit integer default 20
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_allowed boolean := false;
begin
  if length(p_fingerprint) < 16 or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'invalid rate-limit parameters';
  end if;

  delete from public.broadcast_create_limits
   where window_start < v_window - interval '2 hours';

  insert into public.broadcast_create_limits (fingerprint, window_start, attempts)
  values (p_fingerprint, v_window, 1)
  on conflict (fingerprint, window_start) do update
     set attempts = public.broadcast_create_limits.attempts + 1
   where public.broadcast_create_limits.attempts < p_limit
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.claim_broadcast_create_slot(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_broadcast_create_slot(text, integer)
  to service_role;

create or replace function public.apply_broadcast_move(
  p_broadcast_id uuid,
  p_ply integer,
  p_san text,
  p_uci text,
  p_fen_after text,
  p_pgn text,
  p_video_timestamp real default null,
  p_confidence real default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_broadcast public.broadcasts%rowtype;
  v_existing public.broadcast_moves%rowtype;
begin
  select * into v_broadcast
    from public.broadcasts
   where id = p_broadcast_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'broadcast not found';
  end if;
  if v_broadcast.status <> 'live' then
    raise exception using errcode = '55000', message = 'broadcast has ended';
  end if;

  select * into v_existing
    from public.broadcast_moves
   where broadcast_id = p_broadcast_id and ply = p_ply;

  if found then
    if v_existing.san is distinct from p_san
      or v_existing.uci is distinct from p_uci
      or v_existing.fen_after is distinct from p_fen_after then
      raise exception using errcode = '23514', message = 'move conflicts with existing ply';
    end if;
    return 'duplicate';
  end if;

  if p_ply <> v_broadcast.ply_count + 1 then
    raise exception using errcode = '40001', message = 'previous ply has not arrived yet';
  end if;

  insert into public.broadcast_moves (
    broadcast_id, ply, san, uci, fen_after, video_timestamp, confidence
  ) values (
    p_broadcast_id, p_ply, p_san, p_uci, p_fen_after,
    p_video_timestamp, p_confidence
  );

  update public.broadcasts
     set current_fen = p_fen_after,
         pgn = p_pgn,
         ply_count = p_ply,
         updated_at = now()
   where id = p_broadcast_id;

  return 'inserted';
end;
$$;

revoke all on function public.apply_broadcast_move(
  uuid, integer, text, text, text, text, real, real
) from public, anon, authenticated;
grant execute on function public.apply_broadcast_move(
  uuid, integer, text, text, text, text, real, real
) to service_role;

create or replace function public.truncate_broadcast_moves(
  p_broadcast_id uuid,
  p_to_ply integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_broadcast public.broadcasts%rowtype;
  v_actual_ply integer;
  v_fen text;
begin
  if p_to_ply < 0 then
    raise exception using errcode = '22023', message = 'toPly must be non-negative';
  end if;

  select * into v_broadcast
    from public.broadcasts
   where id = p_broadcast_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'broadcast not found';
  end if;
  if p_to_ply >= v_broadcast.ply_count then
    return v_broadcast.ply_count;
  end if;

  delete from public.broadcast_moves
   where broadcast_id = p_broadcast_id and ply > p_to_ply;

  select ply, fen_after into v_actual_ply, v_fen
    from public.broadcast_moves
   where broadcast_id = p_broadcast_id
   order by ply desc
   limit 1;

  v_actual_ply := coalesce(v_actual_ply, 0);
  v_fen := coalesce(
    v_fen,
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  );

  update public.broadcasts
     set ply_count = v_actual_ply,
         current_fen = v_fen,
         pgn = '',
         revision = revision + 1,
         updated_at = now()
   where id = p_broadcast_id;

  return v_actual_ply;
end;
$$;

revoke all on function public.truncate_broadcast_moves(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.truncate_broadcast_moves(uuid, integer)
  to service_role;

-- Rollback path (only after restoring the old viewer): recreate the two SELECT
-- policies/grants, then drop these three functions and the rate-limit table.;
