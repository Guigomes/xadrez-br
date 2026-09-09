// Aplica supabase/migrations/075_asaas_subscriptions.sql via conexão direta
// Postgres (mesmo padrão de apply-048..074.mjs). Exige a 073 já aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-075.mjs
//   (ou: node --env-file=.env.local scripts/apply-075.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '075_asaas_subscriptions.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 075_asaas_subscriptions.sql em uma transação…');

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

  const { rows: tabelas } = await client.query(
    `select table_name from information_schema.tables
      where table_name in ('subscriptions', 'asaas_webhook_events')
      order by table_name`
  );
  console.log('tabelas criadas:', tabelas.map((r) => r.table_name).join(', '));

  const { rows: colunas } = await client.query(
    `select column_name from information_schema.columns
      where table_name = 'user_profiles' and column_name in ('asaas_customer_id', 'cpf_cnpj')
      order by column_name`
  );
  console.log('colunas novas em user_profiles:', colunas.map((r) => r.column_name).join(', '));

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
