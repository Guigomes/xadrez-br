alter table public.tournaments
  add column if not exists is_international boolean not null default false;

comment on column public.tournaments.is_international is
  'Exibe federação/país dos jogadores, filtro de país e desempenho por país.';

-- Todos os torneios existentes recebem false pelo default; apenas este Mundial recebe true.
update public.tournaments
set is_international = true
where slug = 'campeonato-mundial-fide-sub-7-a-sub-17-2026-20261014';

notify pgrst, 'reload schema';
