// Aplica supabase/migrations/076_plan_mock_pricing.sql via conexão direta
// Postgres (mesmo padrão de apply-048..075.mjs). Exige a 075 já aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-076.mjs
//   (ou: node --env-file=.env.local scripts/apply-076.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '076_plan_mock_pricing.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 076_plan_mock_pricing.sql em uma transação…');

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

  const { rows: planos } = await client.query(
    `select code, price_cents, currency, billing_interval from plans order by sort_order`
  );
  console.log('planos:', planos);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
