-- Aba "Por cidade" no torneio (desempenho agregado pela cidade dos jogadores), como a
-- "Por país" dos internacionais. Ligada pelo organizador no formulário do torneio; nasce
-- desligada. Primeiro uso: etapas do Festival da Criança MS 2026 (pedido do dono, 2026-11-26).
-- get_tournament_page_data devolve a linha inteira de tournaments, então a coluna chega à
-- página sem mudar a função.
alter table public.tournaments add column if not exists show_city_ranking boolean not null default false;

comment on column public.tournaments.show_city_ranking is
  'Mostra a aba "Por cidade" (desempenho por cidade dos jogadores, players.city).';
