// Aplica as duas migrations do Gambito Lite F3, em transações separadas e nesta ordem:
//   20261021115900_tournament_mode_app.sql  (valor 'app' no enum — precisa estar commitado
//                                            antes de a segunda usá-lo)
//   20261021120000_gambito_lite_sync.sql    (lite_tournaments + lite_publish/unpublish/delete)
//
// Uso:
//   node --env-file=.env.local scripts/apply-20261021120000.mjs

import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Faltou SUPABASE_DB_URL (ou DATABASE_URL). Veja o comentário no topo deste arquivo.');
  process.exit(1);
}

const files = ['20261021115900_tournament_mode_app.sql', '20261021120000_gambito_lite_sync.sql'];
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  for (const file of files) {
    const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', file), 'utf8');
    console.log(`Aplicando ${file} em uma transação…`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
      console.log('  ok');
    } catch (err) {
      await client.query('rollback');
      console.error('  Falhou, rollback feito. Erro:', err.message);
      process.exit(1);
    }
  }

  const mode = await client.query("select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'tournament_mode' and e.enumlabel = 'app'");
  console.log("enum tournament_mode 'app':", mode.rowCount ? 'ok' : 'FALTANDO');
  const table = await client.query("select 1 from information_schema.tables where table_name = 'lite_tournaments'");
  console.log('tabela lite_tournaments:', table.rowCount ? 'ok' : 'FALTANDO');
  const fns = await client.query("select proname from pg_proc where proname in ('lite_publish', 'lite_unpublish', 'lite_delete') order by 1");
  console.log('funções:', fns.rows.map((r) => r.proname).join(', '));

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
