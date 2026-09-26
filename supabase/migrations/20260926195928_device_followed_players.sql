-- Espelha no registro anônimo do aparelho a lista local de atletas seguidos.
-- Os IDs são validados pelo backend contra players antes de serem gravados.
alter table public.site_devices
  add column if not exists followed_player_ids uuid[] not null default '{}';
