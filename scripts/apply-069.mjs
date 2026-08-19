// Aplica supabase/migrations/069_tournament_series.sql via conexão direta
// Postgres (mesmo padrão de apply-048..068.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-069.mjs
//   (ou: node --env-file=.env.local scripts/apply-069.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '069_tournament_series.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 069_tournament_series.sql em uma transação…');

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

  // Verificação: 4 tabelas novas, o enum de status e o helper de permissão.
  const { rows: tables } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('tournament_series', 'series_points_rules',
                         'series_tournaments', 'series_points_awarded')
    order by table_name
  `);
  const { rows: enums } = await client.query(`
    select typname from pg_type where typname = 'series_status'
  `);
  const { rows: fns } = await client.query(`
    select proname from pg_proc where proname = 'is_series_manager'
  `);
  const { rows: policies } = await client.query(`
    select count(*)::int as n from pg_policies
    where schemaname = 'public'
      and tablename in ('tournament_series', 'series_points_rules',
                        'series_tournaments', 'series_points_awarded')
  `);

  console.log('tabelas (esperado 4):', tables.map((r) => r.table_name).join(', '));
  console.log('enum series_status:', enums.length === 1 ? 'ok' : 'NÃO — algo deu errado');
  console.log('is_series_manager:', fns.length === 1 ? 'ok' : 'NÃO — algo deu errado');
  console.log('policies (esperado 10):', policies[0].n);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
