// Aplica supabase/migrations/038_tournament_status_published_and_closed.sql
// via conexão direta Postgres (mesmo padrão de apply-035.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-038.mjs
//
// SUPABASE_DB_URL (ou DATABASE_URL) não está em .env.local deste repo —
// só há NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, que não bastam pra rodar DDL.
// Pegue a connection string em Supabase → Project Settings → Database
// (Connection string → URI). Atenção ao aviso de IPv6: o host direto do
// Supabase só resolve por IPv6; se a rede local não tiver rota, a conexão
// falha com ENETUNREACH mesmo com DNS ok — nesse caso use o "Connection
// pooling" (porta 6543, host com sufixo -pooler) em vez do host direto.
//
// Diferente de apply-035.mjs: a checagem final aqui não é contagem, é a
// ORDEM do enum (ALTER TYPE ADD VALUE ... BEFORE só funciona se os sete
// valores ficarem na sequência certa) — por isso o bloco de verificação é
// dedicado em vez de reusar o loop genérico de "checks".

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '038_tournament_status_published_and_closed.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const EXPECTED_ORDER = ['draft', 'published', 'registration', 'registration_closed', 'ongoing', 'finished', 'cancelled'];

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 038_tournament_status_published_and_closed.sql em uma transação…');

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

  console.log('\nConferindo ordem do enum tournament_status…');

  const { rows } = await client.query(`
    select array_agg(enumlabel order by enumsortorder) as labels
    from pg_enum
    where enumtypid = 'tournament_status'::regtype
  `);
  const labels = rows[0].labels;
  const ok = JSON.stringify(labels) === JSON.stringify(EXPECTED_ORDER);
  console.log(`${ok ? '✓' : '✗'} ordem do enum — esperado ${JSON.stringify(EXPECTED_ORDER)}, achou ${JSON.stringify(labels)}`);

  await client.end();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
