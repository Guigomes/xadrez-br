-- Link de transmissão ao vivo do torneio (ex.: broadcast do Lichess), oferecido pela
-- organização. Quando preenchido, a página pública ganha a aba "Acompanhe ao Vivo".
-- Só aceita https — o link vira <a href> e, se for do Lichess, <iframe src>.
alter table tournaments add column if not exists live_broadcast_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournaments_live_broadcast_url_https'
  ) then
    alter table tournaments
      add constraint tournaments_live_broadcast_url_https
      check (live_broadcast_url is null or live_broadcast_url ~* '^https://');
  end if;
end $$;
