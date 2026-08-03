// Aplica supabase/migrations/057_auto_seed_ranking.sql via conexão direta
// Postgres (mesmo padrão de apply-046.mjs / apply-056.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-057.mjs
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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '057_auto_seed_ranking.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 057_auto_seed_ranking.sql em uma transação…');

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

  console.log('\nConferindo approve_registration chama generate_initial_ranking…');
  const { rows } = await client.query(`
    select pg_get_functiondef(oid) as def
    from pg_proc where proname = 'approve_registration'
  `);
  const ok = (rows[0]?.def ?? '').includes('generate_initial_ranking');
  console.log(`${ok ? '✓' : '✗'} approve_registration atualizada`);

  await client.end();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
