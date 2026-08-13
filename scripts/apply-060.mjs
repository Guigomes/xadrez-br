// Aplica supabase/migrations/060_admin_fcm_tokens.sql via conexão direta Postgres
// (mesmo padrão de apply-048..059.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-060.mjs

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '060_admin_fcm_tokens.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 060_admin_fcm_tokens.sql em uma transação…');

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

  console.log('\nConferindo objetos criados…');
  let allOk = true;

  const check = (ok, label) => {
    allOk = allOk && ok;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  };

  const { rows: tableRows } = await client.query(
    `select count(*)::int as n from information_schema.tables where table_name = 'admin_fcm_tokens'`
  );
  check(tableRows[0].n === 1, 'tabela admin_fcm_tokens existe');

  const { rows: idxRows } = await client.query(
    `select count(*)::int as n from pg_indexes where indexname = 'admin_fcm_tokens_user_id_idx'`
  );
  check(idxRows[0].n === 1, 'índice admin_fcm_tokens_user_id_idx existe');

  const { rows: polRows } = await client.query(
    `select count(*)::int as n from pg_policies where tablename = 'admin_fcm_tokens'`
  );
  check(polRows[0].n === 3, `3 policies em admin_fcm_tokens (achou ${polRows[0].n})`);

  const { rows: errPolRows } = await client.query(
    `select count(*)::int as n from pg_policies
     where tablename = 'error_logs' and policyname = 'error_logs_delete_admin'`
  );
  check(errPolRows[0].n === 1, 'policy error_logs_delete_admin existe');

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
