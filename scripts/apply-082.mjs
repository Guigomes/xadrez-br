// Aplica supabase/migrations/082_billing_switch.sql via conexão direta
// Postgres (mesmo padrão de apply-048..081.mjs). Exige a 073 já aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-082.mjs
//   (ou: node --env-file=.env.local scripts/apply-082.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '082_billing_switch.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 082_billing_switch.sql em uma transação…');

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

  const { rows: [flag] } = await client.query(`select public.billing_enabled() as on`);
  console.log('billing_enabled():', flag.on, flag.on === false ? '(tudo gratuito)' : '(cobrança LIGADA)');

  // Smoke: sem auth.uid() (contexto de serviço) a régua abre tudo quando a
  // cobrança está desligada.
  const { rows: [e] } = await client.query(
    `select public.has_entitlement('series.enabled') as can, public.entitlement_limit('tournaments.active') as lim`
  );
  console.log('has_entitlement(series.enabled):', e.can, '| entitlement_limit(tournaments.active):', e.lim);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
