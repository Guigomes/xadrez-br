-- Série que espelha a classificação geral OFICIAL publicada pelo organizador.
--
-- O Festival Estadual da Criança e Juventude 2026 (FESMAX) publica o ranking acumulado
-- numa planilha Google (uma aba por categoria, com pontos por etapa, descarte e total).
-- Em vez de recalcular pelas regras do regulamento (descarte da pior etapa, desempate
-- pela última etapa — que o motor de séries não tem), o Gambito mostra a planilha deles.
--
-- Formato: {"source": "FESMAX", "page_url": "https://...", "sheet_url":
--   "https://docs.google.com/spreadsheets/d/e/<id>/pub", "tabs": [{"label": "Sub-07 Masc", "gid": "123"}]}
-- O site só busca sheet_url de docs.google.com/spreadsheets/d/e/.../pub (lib/series/official-ranking.ts);
-- qualquer outro valor é ignorado. Nulo = série calculada pelo motor de sempre.
alter table public.tournament_series
  add column if not exists official_ranking jsonb;

comment on column public.tournament_series.official_ranking is
  'Classificação geral oficial publicada pelo organizador (planilha Google publicada), mostrada no lugar da calculada. Ver migration 20261125210000.';
