-- ============================================================
-- Migration 072: trava do cron-import — impede execuções sobrepostas
-- ============================================================
-- O Cloud Scheduler dispara xadrez-br-cron a cada 1-2 minutos, mas uma
-- execução real leva ~5 minutos (baixa Excel de cada grupo, refaz TODAS as
-- rodadas já publicadas de novo, toda vez). Sem trava nenhuma, isso significa
-- várias execuções da mesma importação escrevendo ao mesmo tempo em
-- tournament_players/players — exatamente a janela em que o organizador edita
-- participantes antes da 1ª rodada, quando o problema foi percebido.
--
-- Linha única (id=1), trava por UPDATE condicional (atômico no Postgres — não
-- depende de advisory lock, que não sobrevive de forma confiável através do
-- pooling de conexão do PostgREST/supabase-js num processo Node de vida
-- longa). Trava expira sozinha depois de STALE_AFTER_MINUTES (index.ts) caso
-- o processo morra sem liberar — sem isso um crash travaria toda importação
-- futura pra sempre.
create table if not exists cron_import_lock (
  id smallint primary key default 1,
  locked_at timestamptz,
  constraint cron_import_lock_single_row check (id = 1)
);

insert into cron_import_lock (id, locked_at)
values (1, null)
on conflict (id) do nothing;

-- service_role (usado pelo worker) só — ninguém mais precisa ler ou escrever
-- aqui. RLS ligada, sem policy nenhuma pra anon/authenticated.
alter table cron_import_lock enable row level security;
