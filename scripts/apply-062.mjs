// Aplica supabase/migrations/062_search_staff_candidates.sql via conexão
// direta Postgres (mesmo padrão de apply-048..061.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-062.mjs

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '062_search_staff_candidates.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 062_search_staff_candidates.sql em uma transação…');

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

  const { rows } = await client.query(
    `select count(*)::int as n from pg_proc where proname = 'search_staff_candidates'`
  );
  check(rows[0].n === 1, 'função search_staff_candidates existe');

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
