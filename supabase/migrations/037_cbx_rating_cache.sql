-- ============================================================
-- Cache de consulta de rating na CBX
-- ============================================================
-- Guarda quando o rating de um jogador foi consultado pela última vez na
-- CBX (cbx.org.br/jogador/{id}) — o gate de "só reconsulta depois de 30
-- dias" fica em app/api/admin/players/[playerId]/cbx-rating/route.ts, este
-- campo é só o carimbo de tempo que essa rota lê e grava.

alter table players add column if not exists cbx_rating_checked_at timestamptz;
