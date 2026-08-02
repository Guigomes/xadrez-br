// Aplica supabase/migrations/053_error_logs.sql via conexão direta Postgres
// (mesmo padrão de apply-048..052.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-053.mjs

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '053_error_logs.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 053_error_logs.sql em uma transação…');

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

  const { rows: tableRows } = await client.query(
    `select count(*)::int as n from information_schema.tables where table_name = 'error_logs'`
  );
  const tableOk = tableRows[0].n === 1;
  allOk = allOk && tableOk;
  console.log(`${tableOk ? '✓' : '✗'} tabela error_logs existe`);

  const { rows: polRows } = await client.query(
    `select count(*)::int as n from pg_policies where tablename = 'error_logs'`
  );
  const polOk = polRows[0].n === 1;
  allOk = allOk && polOk;
  console.log(`${polOk ? '✓' : '✗'} policy de select admin criada (achou ${polRows[0].n})`);

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
