-- Gambito Lite F3: torneio enviado pelo app (somente leitura no site). Em migration própria
-- porque um valor novo de enum não pode ser usado na mesma transação que o cria
-- (20261021120000_gambito_lite_sync.sql já o usa).
alter type tournament_mode add value if not exists 'app';
