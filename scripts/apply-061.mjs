// Aplica supabase/migrations/061_time_control_kind.sql via conexão direta
// Postgres (mesmo padrão de apply-048..059.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-061.mjs

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '061_time_control_kind.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 061_time_control_kind.sql em uma transação…');

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
  const check = (ok, label) => { allOk = allOk && ok; console.log(`${ok ? '✓' : '✗'} ${label}`); };

  const { rows: typeRows } = await client.query(
    `select count(*)::int as n from pg_type where typname = 'time_control_kind'`
  );
  check(typeRows[0].n === 1, 'enum time_control_kind existe');

  const { rows: colRows } = await client.query(
    `select count(*)::int as n from information_schema.columns
     where table_name = 'tournaments' and column_name = 'time_control_kind'`
  );
  check(colRows[0].n === 1, 'coluna tournaments.time_control_kind existe');

  const { rows: fnRows } = await client.query(
    `select pg_get_function_result(oid) as ret from pg_proc where proname = 'search_tournaments' limit 1`
  );
  check(!!fnRows[0] && fnRows[0].ret.includes('time_control_kind'),
    'search_tournaments retorna time_control_kind');

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
