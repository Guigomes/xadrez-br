// Aplica supabase/migrations/051_chat_escalation.sql via conexão direta
// Postgres (mesmo padrão de apply-048/049/050.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-051.mjs
//
// ALTER TYPE ... ADD VALUE dentro de transação é permitido a partir do
// Postgres 12 (Supabase roda versão recente) — só não pode ser usado na
// MESMA transação em que foi adicionado, o que não é o caso aqui (só
// adiciona, não usa o valor novo neste script).

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '051_chat_escalation.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 051_chat_escalation.sql em uma transação…');

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

  console.log('\nConferindo objetos criados…');
  let allOk = true;

  const { rows: enumRows } = await client.query(
    `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'chat_session_status'`
  );
  const labels = enumRows.map((r) => r.enumlabel);
  const enumOk = labels.includes('aguardando_humano') && labels.includes('humano');
  allOk = allOk && enumOk;
  console.log(`${enumOk ? '✓' : '✗'} enum chat_session_status tem aguardando_humano/humano (achou: ${labels.join(', ')})`);

  const { rows: colRows } = await client.query(
    `select table_name, column_name from information_schema.columns
     where (table_name = 'chat_sessions' and column_name in ('escalated_at', 'contact_phone'))
        or (table_name = 'chat_messages' and column_name = 'is_human')`
  );
  const colOk = colRows.length === 3;
  allOk = allOk && colOk;
  console.log(`${colOk ? '✓' : '✗'} 3 colunas novas criadas (achou ${colRows.length}: ${colRows.map((r) => `${r.table_name}.${r.column_name}`).join(', ')})`);

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
