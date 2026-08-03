// Aplica supabase/migrations/058_auto_seed_on_ongoing.sql via conexão direta
// Postgres (mesmo padrão de apply-046.mjs / apply-056.mjs / apply-057.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-058.mjs
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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '058_auto_seed_on_ongoing.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 058_auto_seed_on_ongoing.sql em uma transação…');

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

  console.log('\nConferindo funções criadas/atualizadas…');
  const { rows } = await client.query(`
    select proname from pg_proc
    where proname in ('_generate_initial_ranking', 'generate_initial_ranking', 'get_tournament_by_slug', 'search_tournaments')
  `);
  const names = new Set(rows.map((r) => r.proname));
  const expected = ['_generate_initial_ranking', 'generate_initial_ranking', 'get_tournament_by_slug', 'search_tournaments'];
  let ok = true;
  for (const name of expected) {
    const found = names.has(name);
    ok = ok && found;
    console.log(`${found ? '✓' : '✗'} ${name}`);
  }

  await client.end();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
