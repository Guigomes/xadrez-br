// Aplica supabase/migrations/071_tournament_page_data_rpc.sql via conexão
// direta Postgres (mesmo padrão de apply-048..070.mjs). Exige a 070 já
// aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-071.mjs
//   (ou: node --env-file=.env.local scripts/apply-071.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '071_tournament_page_data_rpc.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const EXPECTED_FNS = ['get_tournament_page_data'];

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 071_tournament_page_data_rpc.sql em uma transação…');

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
    `select proname from pg_proc where proname = any($1) order by proname`,
    [EXPECTED_FNS]
  );
  const found = fns.map((r) => r.proname);
  const missing = EXPECTED_FNS.filter((f) => !found.includes(f));

  console.log(`functions (esperado ${EXPECTED_FNS.length}):`, found.length);
  if (missing.length > 0) console.log('FALTANDO:', missing.join(', '));

  // Smoke read-only: slug inexistente devolve 0 linhas, sem explodir.
  const { rows: smoke } = await client.query(
    `select count(*)::int as n from get_tournament_page_data('slug-que-nao-existe-123')`
  );
  console.log("get_tournament_page_data com slug inexistente:", smoke[0].n === 0 ? 'ok (0 linhas)' : smoke[0].n);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
