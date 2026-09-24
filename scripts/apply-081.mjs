// Aplica supabase/migrations/081_standings_initial_ranking_fallback.sql via
// conexão direta Postgres (mesmo padrão de apply-048..080.mjs). Exige a 080
// já aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-081.mjs
//   (ou: node --env-file=.env.local scripts/apply-081.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '081_standings_initial_ranking_fallback.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 081_standings_initial_ranking_fallback.sql em uma transação…');

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
    `select proname from pg_proc where proname = 'get_tournament_standings'`
  );
  console.log('get_tournament_standings:', fns.length === 1 ? 'ok' : 'FALTANDO');

  // Smoke read-only: uuid inexistente devolve 0 linhas, sem explodir.
  const zero = '00000000-0000-0000-0000-000000000000';
  const { rows: s1 } = await client.query(`select count(*)::int as n from get_tournament_standings($1)`, [zero]);
  console.log('smoke (uuid inexistente):', s1[0].n === 0 ? 'ok (0 linhas)' : s1[0].n);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
