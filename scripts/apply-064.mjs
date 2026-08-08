// Aplica supabase/migrations/064_fix_search_ambiguous_id.sql via
// conexão direta Postgres (mesmo padrão de apply-058..062.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-064.mjs
//
// SUPABASE_DB_URL (ou DATABASE_URL) não está em .env.local deste repo — só há
// NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY (REST, não banco). Use a
// connection string do pooler (porta 6543, ...pooler.supabase.com, vai por
// IPv4) ou cole o SQL no SQL Editor do dashboard.

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '064_fix_search_ambiguous_id.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 064_fix_search_ambiguous_id.sql em uma transação…');

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

  console.log('\nConferindo se search_tournaments devolve registration_closes_by_date…');
  const { rows } = await client.query(`
    select 1
    from pg_proc p
    where p.proname = 'search_tournaments'
      and pg_get_function_result(p.oid) ilike '%registration_closes_by_date%'
  `);
  if (rows.length > 0) {
    console.log('OK: search_tournaments projeta registration_closes_by_date.');
  } else {
    console.error('ERRO: search_tournaments não projeta o campo esperado.');
    process.exit(1);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
