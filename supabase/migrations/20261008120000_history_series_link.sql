-- Etapas de circuito no arquivo histórico.
--
-- Um circuito (série) pode ter etapas na estrutura de torneio ao vivo (series_tournaments)
-- e etapas só no arquivo histórico. series_tournaments só aceita torneio ao vivo, então a
-- etapa arquivada guarda a série direto em history_tournaments. A página da série junta as
-- duas listas.
--
-- Idempotente.

alter table history_tournaments
  add column if not exists series_id    uuid references tournament_series(id) on delete set null,
  add column if not exists series_label text;

create index if not exists idx_history_tournaments_series on history_tournaments (series_id) where series_id is not null;

comment on column history_tournaments.series_id is 'Circuito (tournament_series) a que esta etapa pertence.';
comment on column history_tournaments.series_label is 'Rótulo da etapa no circuito (ex.: "Etapa 3").';
