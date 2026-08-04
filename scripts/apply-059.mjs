// Aplica supabase/migrations/059_news.sql via conexão direta Postgres
// (mesmo padrão de apply-048..058.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-059.mjs

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '059_news.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 059_news.sql em uma transação…');

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

  const check = (ok, label) => {
    allOk = allOk && ok;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  };

  const { rows: tableRows } = await client.query(
    `select count(*)::int as n from information_schema.tables where table_name = 'news'`
  );
  check(tableRows[0].n === 1, 'tabela news existe');

  const { rows: polRows } = await client.query(
    `select count(*)::int as n from pg_policies where tablename = 'news'`
  );
  check(polRows[0].n === 2, `2 policies de select em news (achou ${polRows[0].n})`);

  const { rows: bucketRows } = await client.query(
    `select public from storage.buckets where id = 'news-covers'`
  );
  check(bucketRows[0]?.public === true, 'bucket news-covers existe e é público');

  const { rows: stPolRows } = await client.query(
    `select count(*)::int as n from pg_policies
     where tablename = 'objects' and policyname like 'news-covers%'`
  );
  check(stPolRows[0].n === 3, `3 policies de storage pro bucket (achou ${stPolRows[0].n})`);

  // O check de coerência é a única guarda contra scope='national' com UF —
  // confirma que ele existe antes de confiar nele nas rotas de API.
  const { rows: ckRows } = await client.query(
    `select count(*)::int as n from pg_constraint where conname = 'news_scope_state_coherent'`
  );
  check(ckRows[0].n === 1, 'constraint news_scope_state_coherent existe');

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
