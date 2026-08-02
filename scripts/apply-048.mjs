// Aplica supabase/migrations/048_chat_kb.sql via conexão direta Postgres
// (mesmo padrão de apply-035.mjs / apply-046.mjs / apply-047.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-048.mjs
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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '048_chat_kb.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 048_chat_kb.sql em uma transação…');

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

  const { rows: tblRows } = await client.query(
    `select count(*)::int as n from information_schema.tables where table_name = 'kb_chunks'`
  );
  const tableOk = tblRows[0].n === 1;
  console.log(`${tableOk ? '✓' : '✗'} tabela kb_chunks existe`);

  const { rows: fnRows } = await client.query(
    `select count(*)::int as n from pg_proc where proname = 'match_kb_chunks'`
  );
  const fnOk = fnRows[0].n === 1;
  console.log(`${fnOk ? '✓' : '✗'} função match_kb_chunks existe`);

  const { rows: idxRows } = await client.query(
    `select count(*)::int as n from pg_indexes where indexname = 'kb_chunks_embedding_idx'`
  );
  const idxOk = idxRows[0].n === 1;
  console.log(`${idxOk ? '✓' : '✗'} índice kb_chunks_embedding_idx existe`);

  await client.end();
  process.exit(tableOk && fnOk && idxOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
