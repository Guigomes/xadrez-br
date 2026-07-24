-- ============================================================
-- Migration 033: bye de folga do rodízio (round-robin)
-- ============================================================
-- No rodízio com número ímpar de jogadores, um jogador folga a cada rodada.
-- Diferente do bye-cheio do Suíço, a folga do rodízio NÃO dá ponto (o jogador
-- apenas não joga aquela rodada). Novo valor de enum para rotular a linha;
-- a pontuação (0) vem de pairings.white_points, como nos demais byes.
--
-- PG15 permite ADD VALUE fora de uso no mesmo arquivo (não referenciamos o
-- valor novo aqui).

alter type bye_kind add value if not exists 'round_robin';
