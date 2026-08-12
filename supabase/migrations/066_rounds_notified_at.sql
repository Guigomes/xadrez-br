-- ============================================================
-- Chess Viewer – Migration 066: rounds.notified_at
-- ============================================================
-- Deduplicação de push de rodada importada pelo cron.
--
-- Contexto: até aqui o push a seguidores/inscritos (sendTournamentNotification
-- + notifyPlayerFollowers) só disparava pelas rotas MANUAIS do chess-viewer
-- (import-pairings / import-standings). O worker cron-import gravava os
-- pairings direto no banco, sem nenhum push — importação automática ficava
-- silenciosa.
--
-- Agora o cron avisa a rota interna POST /api/internal/notify-round quando
-- publica uma rodada; essa rota dispara o push e carimba notified_at para não
-- repetir. O carimbo é o guard idempotente: como o cron roda a cada 2 min, sem
-- ele toda rodada já publicada seria renotificada em loop.
--
-- Rodadas que já existem recebem notified_at = now() no backfill, para não
-- disparar push retroativo de torneios antigos. Rodadas novas nascem com
-- notified_at NULL (sem default) => elegíveis a notificar uma única vez.

alter table rounds
  add column if not exists notified_at timestamptz;

-- Backfill: nada de push retroativo para rodadas que já existiam.
update rounds set notified_at = now() where notified_at is null;
