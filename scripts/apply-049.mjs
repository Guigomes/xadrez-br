// Aplica supabase/migrations/049_chat_sessions.sql via conexão direta
// Postgres (mesmo padrão de apply-035.mjs / apply-046.mjs / apply-047.mjs /
// apply-048.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-049.mjs
//
// SUPABASE_DB_URL (ou DATABASE_URL) não está em .env.local deste repo —
// só há NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, que não bastam pra rodar DDL.
// Pegue a connection string em Supabase → Project Settings → Database
// (Connection string → URI). Atenção ao aviso de IPv6: o host direto do
// Supabase só resolve por IPv6; se a rede local não tiver rota, a conexão
// falha com ENETUNREACH mesmo com DNS ok — nesse caso use o "Connection
// pooling" (porta 6543, host com sufixo -pooler) em vez do host direto.

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '049_chat_sessions.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 049_chat_sessions.sql em uma transação…');

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

  const tables = ['chat_sessions', 'chat_messages'];
  let allOk = true;
  for (const t of tables) {
    const { rows } = await client.query(
      `select count(*)::int as n from information_schema.tables where table_name = $1`, [t]
    );
    const ok = rows[0].n === 1;
    allOk = allOk && ok;
    console.log(`${ok ? '✓' : '✗'} tabela ${t} existe`);
  }

  const { rows: polRows } = await client.query(
    `select count(*)::int as n from pg_policies where tablename in ('chat_sessions', 'chat_messages')`
  );
  const polOk = polRows[0].n === 2;
  allOk = allOk && polOk;
  console.log(`${polOk ? '✓' : '✗'} 2 policies de select criadas (achou ${polRows[0].n})`);

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
