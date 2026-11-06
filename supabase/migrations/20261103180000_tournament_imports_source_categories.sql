alter table public.tournament_imports
  add column if not exists import_source_categories boolean not null default true;

comment on column public.tournament_imports.import_source_categories is
  'false: o worker ignora a coluna "Tipo" da fonte e não cria/atribui categoria. Para grupos cuja faixa já é o próprio grupo de emparceiramento (ex.: Mundial de Seniores 50+/65+), onde a categoria só repetiria a classificação do grupo.';

notify pgrst, 'reload schema';
