// Aplica supabase/migrations/067_chat_anonymous.sql via conexão direta
// Postgres (mesmo padrão de apply-048..066.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-067.mjs
//   (ou: node --env-file=.env.local scripts/apply-067.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '067_chat_anonymous.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 067_chat_anonymous.sql em uma transação…');

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

  // Verificação: user_id ficou nullable e as duas policies _anon existem.
  const { rows: col } = await client.query(`
    select is_nullable
    from information_schema.columns
    where table_name = 'chat_sessions' and column_name = 'user_id'
  `);
  console.log(`chat_sessions.user_id: nullable=${col[0]?.is_nullable} (esperado YES)`);

  const { rows: pol } = await client.query(`
    select policyname from pg_policies
    where tablename in ('chat_sessions', 'chat_messages') and policyname like '%_anon'
    order by policyname
  `);
  console.log('Policies anônimas:', pol.map((p) => p.policyname).join(', ') || '(nenhuma!)');

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
