-- Rating internacional (FIDE) do jogador como a fonte do torneio publicou.
--
-- Fica no participante, não no cadastro global: o chess-results mostra o rating
-- FIDE do ritmo daquele torneio (clássico, rápido ou blitz), então o mesmo
-- jogador tem valores diferentes em torneios diferentes. O rating que já
-- aparece nos importados (players.rating_std) é o nacional ("EloN").
-- Gravado pelo robô de importação (coluna "EloI"); nulo quando a fonte não traz.
alter table public.tournament_players
  add column if not exists fide_rating integer;

comment on column public.tournament_players.fide_rating is
  'Rating FIDE do jogador no ritmo do torneio, como publicado pela fonte importada (chess-results "EloI"). Nulo se a fonte não traz.';
