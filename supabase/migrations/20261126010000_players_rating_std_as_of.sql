-- Data do torneio de onde veio players.rating_std (cadastro global).
-- O robô de importação grava o rating da fonte em cada sincronização; sincronizar um
-- torneio antigo depois de um recente punha de volta o rating antigo (visto em
-- 2026-11-25: Etapas 1–3 do Festival da Criança, abr–jul, regravaram os ratings que
-- a Grande Final, nov, tinha trazido). Com a data, torneio mais antigo não sobrescreve.
alter table public.players add column if not exists rating_std_as_of date;

comment on column public.players.rating_std_as_of is
  'Data de início do torneio importado que trouxe o rating_std atual. O robô só regrava rating_std com torneio da mesma data ou mais novo.';
