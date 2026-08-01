// Aplica supabase/migrations/046_approve_registration_backfill_player.sql
// via conexão direta Postgres (mesmo padrão de apply-035.mjs / apply-038.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-046.mjs
//
// SUPABASE_DB_URL (ou DATABASE_URL) não está em .env.local deste repo —
// só há NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, que não bastam pra rodar DDL.
// Pegue a connection string em Supabase → Project Settings → Database
// (Connection string → URI). Atenção ao aviso de IPv6: o host direto do
// Supabase só resolve por IPv6; se a rede local não tiver rota, a conexão
// falha com ENETUNREACH mesmo com DNS ok — nesse caso use o "Connection
// pooling" (porta 6543, host com sufixo -pooler) em vez do host direto.
//
// Checagem: a definição de approve_registration precisa conter os novos
// coalesce() de birth_year/city/federation/fide_id/cbx_id/rating_std — sem
// isso, o bug (reaproveitar players existente sem atualizar dado novo da
// inscrição) continua.

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '046_approve_registration_backfill_player.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const REQUIRED_FRAGMENTS = [
  'coalesce(birth_year, v_reg.birth_year)',
  'coalesce(city, v_reg.city)',
  'coalesce(federation, v_reg.federation)',
  'coalesce(fide_id, v_reg.fide_id)',
  'coalesce(cbx_id, v_reg.cbx_id)',
  'coalesce(rating_std, v_reg.rating_std)',
];

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 046_approve_registration_backfill_player.sql em uma transação…');

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

  console.log('\nConferindo definição de approve_registration…');
  const { rows } = await client.query(`select pg_get_functiondef(oid) as def from pg_proc where proname = 'approve_registration'`);
  const def = (rows[0]?.def ?? '').toLowerCase();

  let allOk = true;
  for (const fragment of REQUIRED_FRAGMENTS) {
    const ok = def.includes(fragment);
    allOk = allOk && ok;
    console.log(`${ok ? '✓' : '✗'} contém "${fragment}"`);
  }

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
