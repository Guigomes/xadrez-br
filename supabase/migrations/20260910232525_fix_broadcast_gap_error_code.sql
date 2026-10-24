-- RECUPERADA do registro do Supabase (supabase_migrations.schema_migrations) em 2026-10-24.
-- Esta migration já estava aplicada em produção mas não tinha arquivo neste repositório:
-- ela pertence ao app de transmissão de partidas ("Chess Match Film"), que usa o MESMO
-- banco do Gambito Torneios. O conteúdo abaixo é exatamente o que foi aplicado (versão 20260910232525).
-- 40001 means serialization_failure and can trigger automatic retries.
-- A missing previous ply is an application-level, retryable ordering gap.
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
    raise exception using errcode = 'P0001', message = 'previous ply has not arrived yet';
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
