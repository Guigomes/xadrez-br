-- Competição nacional de base no arquivo histórico.
--
-- O nome do torneio não serve de filtro: o Brasileiro de Categorias aparece como
-- "FENAC 2015 - Brasileiro - Clássico", "FENAC&FENAJ 2024 - ...", "Campeonato Brasileiro
-- Juvenil 2011 - ..."; e "Escolar"/"Juvenil" também aparecem em torneios que não são o
-- nacional (ex.: "Curitiba Chess Open 2026 - Escolar", "Jogos Escolares Juvenil 12 a 14").
-- A competição vira coluna própria, preenchida pela carga e usada no filtro de /historico.
--
-- Valores:
--   categorias = Brasileiro de Categorias (FENAC, FENAJ, Brasileiro Juvenil, anos ímpares)
--   escolar    = Brasileiro Escolar (CBXE)
--   jebs       = Jogos Escolares Brasileiros (CBDE)
--
-- Idempotente.

alter table history_tournaments
  add column if not exists competition text;

alter table history_tournaments drop constraint if exists history_tournaments_competition_check;
alter table history_tournaments
  add constraint history_tournaments_competition_check
  check (competition is null or competition in ('categorias', 'escolar', 'jebs'));

create index if not exists idx_history_tournaments_competition
  on history_tournaments (competition) where competition is not null;

comment on column history_tournaments.competition is
  'Competição nacional de base: categorias (FENAC/FENAJ/Juvenil), escolar (CBXE) ou jebs (CBDE). Nulo = outro torneio.';

-- Torneios já carregados (conferido em 2026-11-23: 78 categorias, 4 escolar, 1 jebs).
update history_tournaments set competition = 'categorias'
 where competition is null
   and (name ~* '^(fenac|fenaj)\M' or name ~* '^campeonato brasileiro juvenil \d{4}');

update history_tournaments set competition = 'escolar'
 where competition is null
   and name ~* '^campeonato brasileiro de xadrez escolar \d{4}';

update history_tournaments set competition = 'jebs'
 where competition is null
   and name ~* '^jogos escolares';
