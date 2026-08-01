// Aplica supabase/migrations/047_start_time_in_ongoing_rule.sql via conexão
// direta Postgres (mesmo padrão de apply-035.mjs / apply-038.mjs / apply-046.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-047.mjs
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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '047_start_time_in_ongoing_rule.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 047_start_time_in_ongoing_rule.sql em uma transação…');

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

  console.log('\nConferindo assinatura de next_status_by_date (5 parâmetros, com p_start_time)…');

  const { rows } = await client.query(`
    select pg_get_function_arguments(oid) as args
    from pg_proc where proname = 'next_status_by_date'
  `);
  const args = rows[0]?.args ?? '';
  const ok = args.includes('p_start_time') && args.split(',').length === 5;
  console.log(`${ok ? '✓' : '✗'} assinatura — achou: (${args})`);

  const { rows: fnRows } = await client.query(`select count(*)::int as n from pg_proc where proname = 'now_brt'`);
  const nowBrtOk = fnRows[0].n === 1;
  console.log(`${nowBrtOk ? '✓' : '✗'} função now_brt existe`);

  await client.end();
  process.exit(ok && nowBrtOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
