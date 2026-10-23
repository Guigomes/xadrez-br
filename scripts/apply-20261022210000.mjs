// Aplica supabase/migrations/20261022210000_lite_categories.sql via
// conexão direta Postgres (mesmo padrão de apply-048..083.mjs).
//
// Uso:
//   node --env-file=.env.local scripts/apply-20261022210000.mjs

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

const file = '20261022210000_lite_categories.sql';
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', file), 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log(`Conectado. Aplicando ${file} em uma transação…`);

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

  const { rows } = await client.query("select pg_get_functiondef('public.lite_publish(uuid, text)'::regprocedure) d");
  console.log('lite_publish com categorias:', rows[0].d.includes('lite-cat:') ? 'ok' : 'NÃO — confira');

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
