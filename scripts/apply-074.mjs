// Aplica supabase/migrations/074_search_users_for_plan.sql via conexão direta
// Postgres (mesmo padrão de apply-048..071.mjs). Exige a 073 já aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-074.mjs
//   (ou: node --env-file=.env.local scripts/apply-074.mjs)

import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    'Faltou SUPABASE_DB_URL (ou DATABASE_URL). Veja o comentário no topo deste arquivo.'
  );
  process.exit(1);
}

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '074_search_users_for_plan.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 074_search_users_for_plan.sql em uma transação…');

  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('commit');
    console.log('Migration aplicada e commitada.');
  } catch (err) {
    await client.query('rollback');
    console.error('Falhou, rollback feito. Erro:', err.message);
    process.exit(1);
  }

  const { rows: fns } = await client.query(
    `select proname from pg_proc where proname = 'search_users_for_plan'`
  );
  console.log('function search_users_for_plan:', fns.length === 1 ? 'ok' : 'FALTANDO');

  const { rows: smoke } = await client.query(
    `select count(*)::int as n from search_users_for_plan('xxxxxxxxxx')`
  );
  console.log('smoke (não-admin/service role bate a guarda, deve dar 0):', smoke[0].n);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
