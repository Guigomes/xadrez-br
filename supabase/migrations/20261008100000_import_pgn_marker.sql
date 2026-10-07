-- Marcador da busca de PGN pelo robô de importação (cron-import).
--
-- O robô passa a baixar os lances (PGN) dos torneios que os publicam, mas só depois
-- que o grupo termina e uma vez só: cada tentativa custa de 1 a 2 requisições quando o
-- torneio não tem PGN, e uma por partida quando tem. Sem o marcador, o robô repetiria
-- essa busca a cada execução.
--
-- pgn_checked_at / pgn_check_count: quando e quantas vezes o robô já olhou. Até 3
-- tentativas, 6 horas entre elas (torneios que publicam os lances depois). Quando
-- encontra PGN, o robô encerra as tentativas.
--
-- Idempotente.

alter table tournament_imports
  add column if not exists pgn_checked_at timestamptz,
  add column if not exists pgn_check_count smallint not null default 0;

comment on column tournament_imports.pgn_checked_at is
  'Última vez que o robô procurou PGN para este grupo.';
comment on column tournament_imports.pgn_check_count is
  'Quantas vezes o robô procurou PGN (para depois de 3 ou quando encontra).';
