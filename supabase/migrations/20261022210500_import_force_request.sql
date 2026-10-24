-- ============================================================
-- Pedido de sincronização imediata para o robô (cron-import)
-- ============================================================
-- O botão "Dev: forçar sincronização" rodava uma CÓPIA antiga do importador
-- dentro do site (lib/import/), que tinha ficado para trás em relação ao
-- robô: sem a planilha completa (cortava em 150 linhas), sem o casamento por
-- ID CBX e sem PGN. Agora o botão só marca o pedido aqui e o robô — a única
-- implementação do importador — processa essas linhas primeiro na próxima
-- execução, mesmo desligadas (enabled = false) ou de torneio já encerrado, e
-- limpa a marca ao terminar.
--
-- Idempotente.

alter table tournament_imports add column if not exists force_requested_at timestamptz;

comment on column tournament_imports.force_requested_at is
  'Pedido de sincronização imediata (botão do admin). O cron-import processa na próxima execução, mesmo com enabled=false ou torneio encerrado, e volta para null.';

create index if not exists idx_tournament_imports_force
  on tournament_imports(force_requested_at) where force_requested_at is not null;
