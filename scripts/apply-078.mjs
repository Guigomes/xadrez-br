// Aplica supabase/migrations/078_registration_online_payment.sql via conexão
// direta Postgres (mesmo padrão de apply-048..077.mjs). Exige a 077 já
// aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-078.mjs
//   (ou: node --env-file=.env.local scripts/apply-078.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '078_registration_online_payment.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const EXPECTED_COLUMNS = [
  ['tournaments', 'accept_online_payment'],
  ['tournaments', 'registration_fee_cents'],
  ['tournament_registrations', 'payment_status'],
  ['tournament_registrations', 'cpf_cnpj'],
  ['tournament_registrations', 'asaas_customer_id'],
  ['tournament_registrations', 'asaas_payment_id'],
  ['tournament_registrations', 'asaas_invoice_url'],
];
const EXPECTED_FNS = ['enforce_registration_payment_status', 'enforce_registration_payment_entitlement'];

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 078_registration_online_payment.sql em uma transação…');

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

  for (const [table, column] of EXPECTED_COLUMNS) {
    const { rows } = await client.query(
      `select 1 from information_schema.columns where table_name = $1 and column_name = $2`,
      [table, column]
    );
    console.log(`${table}.${column}:`, rows.length === 1 ? 'ok' : 'FALTANDO');
  }

  const { rows: fns } = await client.query(
    `select proname from pg_proc where proname = any($1) order by proname`,
    [EXPECTED_FNS]
  );
  const found = fns.map((r) => r.proname);
  const missing = EXPECTED_FNS.filter((f) => !found.includes(f));
  console.log(`functions (esperado ${EXPECTED_FNS.length}):`, found.length);
  if (missing.length > 0) console.log('FALTANDO:', missing.join(', '));

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
