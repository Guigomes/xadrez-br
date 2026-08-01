-- ============================================================
-- Chess Viewer - Migration 044: horário de início do torneio (opcional)
-- ============================================================
-- Puramente informativo — não participa de nenhuma regra de status (essas
-- continuam por data, today_brt(), migration 043). Sem valor, o campo some
-- da exibição pública; com valor, aparece junto da data de início.

alter table tournaments
  add column if not exists start_time time null;
