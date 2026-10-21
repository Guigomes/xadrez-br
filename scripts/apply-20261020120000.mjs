// Aplica supabase/migrations/20261020120000_chat_inbox.sql via
// conexão direta Postgres (mesmo padrão de apply-048..083.mjs).
//
// Uso:
//   node --env-file=.env.local scripts/apply-20261020120000.mjs

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

const file = '20261020120000_chat_inbox.sql';
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

  const { rows } = await client.query("select column_name from information_schema.columns where table_name = 'chat_sessions' and column_name in ('user_last_read_at', 'started_by') order by 1");
  console.log('colunas:', rows.map((r) => r.column_name).join(', ') || 'NENHUMA — confira');
  const fn = await client.query("select 1 from pg_proc where proname = 'my_unread_chat_count'");
  console.log('função my_unread_chat_count:', fn.rowCount ? 'ok' : 'FALTANDO');

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
