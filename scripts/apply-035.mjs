// Aplica supabase/migrations/035_classification_partition.sql via conexão
// direta Postgres (padrão citado no CLAUDE.md — mesma forma que
// cron-import/apply-*.mjs usa lá, adaptado pra este repo que não tem esse
// script pronto). Depois confere contagens exatas do que a migration cria.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-035.mjs
//
// SUPABASE_DB_URL (ou DATABASE_URL) não está em .env.local deste repo —
// só há NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, que não bastam pra rodar DDL.
// Pegue a connection string em Supabase → Project Settings → Database
// (Connection string → URI). Atenção ao aviso de IPv6 do CLAUDE.md: o host
// direto do Supabase só resolve por IPv6; se a rede local não tiver rota,
// a conexão falha com ENETUNREACH mesmo com DNS ok — nesse caso use o
// "Connection pooling" (porta 6543, host com sufixo -pooler) em vez do
// host direto.

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '035_classification_partition.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 035_classification_partition.sql em uma transação…');

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

  console.log('\nConferindo contagens exatas…');

  const checks = [
    {
      label: 'tournament_categories.sort_order existe',
      sql: `select count(*)::int as n from information_schema.columns
            where table_name = 'tournament_categories' and column_name = 'sort_order'`,
      expect: 1,
    },
    {
      label: 'tournaments.classification_dimensions existe',
      sql: `select count(*)::int as n from information_schema.columns
            where table_name = 'tournaments' and column_name = 'classification_dimensions'`,
      expect: 1,
    },
    {
      label: 'tournaments.pairing_split existe',
      sql: `select count(*)::int as n from information_schema.columns
            where table_name = 'tournaments' and column_name = 'pairing_split'`,
      expect: 1,
    },
    {
      label: 'índice único idx_tournament_categories_unique_name existe',
      sql: `select count(*)::int as n from pg_indexes
            where indexname = 'idx_tournament_categories_unique_name'`,
      expect: 1,
    },
    {
      label: 'FK tournament_players_category_id_fkey tem on delete set null',
      sql: `select count(*)::int as n from pg_constraint
            where conname = 'tournament_players_category_id_fkey' and confdeltype = 'n'`,
      expect: 1,
    },
    {
      label: 'função derive_player_category existe',
      sql: `select count(*)::int as n from pg_proc where proname = 'derive_player_category'`,
      expect: 1,
    },
    {
      label: 'função refresh_tournament_categories existe',
      sql: `select count(*)::int as n from pg_proc where proname = 'refresh_tournament_categories'`,
      expect: 1,
    },
    {
      label: 'get_tournament_standings retorna category_id',
      sql: `select count(*)::int as n
            from information_schema.routines r
            join information_schema.parameters p
              on p.specific_name = r.specific_name
            where r.routine_name = 'get_tournament_standings'
              and p.parameter_name = 'category_id'`,
      expect: 1,
    },
  ];

  let allOk = true;
  for (const check of checks) {
    const { rows } = await client.query(check.sql);
    const n = rows[0].n;
    const ok = n === check.expect;
    allOk = allOk && ok;
    console.log(`${ok ? '✓' : '✗'} ${check.label} — esperado ${check.expect}, achou ${n}`);
  }

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
