-- One private photo per global players.id: <uuid>/photo.webp.
-- Only checked server-side endpoints access these objects using service_role:
-- Dev manages them; the finished-event podium proxy may read its three winners.
-- No public player schema, RPC return shape, or existing bucket is changed.
-- Rollback: disable the endpoint/UI first; preserve this bucket and its files.
-- Never delete a populated bucket as part of a code rollback.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', false, 3145728, array['image/webp'])
on conflict (id) do nothing;

-- Refuse an incompatible pre-existing bucket instead of exposing uploaded photos.
do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'player-photos' and not public
      and file_size_limit = 3145728 and allowed_mime_types = array['image/webp']::text[]
  ) then
    raise exception 'player-photos exists with incompatible privacy/upload settings';
  end if;
end;
$$;

-- Defense in depth against permissive policies added for unrelated buckets.
-- The Dev session itself cannot bypass Storage; it must use the checked API.
drop policy if exists "player-photos: server only" on storage.objects;
create policy "player-photos: server only" on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'player-photos')
with check (bucket_id <> 'player-photos');
