// Aplica supabase/migrations/073_plans_and_entitlements.sql via conexão direta
// Postgres (mesmo padrão de apply-048..071.mjs). Exige a 072 já aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-073.mjs
//   (ou: node --env-file=.env.local scripts/apply-073.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '073_plans_and_entitlements.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 073_plans_and_entitlements.sql em uma transação…');

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

  const { rows: planos } = await client.query(
    `select p.code, count(e.key)::int as entitlements
       from plans p left join plan_entitlements e on e.plan_id = p.id
      group by p.code order by min(p.sort_order)`
  );
  console.log('planos:', planos);

  const { rows: semPlano } = await client.query(
    `select count(*)::int as n from user_profiles where plan_id is null`
  );
  console.log('usuarios sem plano (esperado 0):', semPlano[0].n);

  const { rows: fns } = await client.query(
    `select proname from pg_proc
      where proname in ('has_entitlement','entitlement_limit','get_my_entitlements',
                        'set_user_plan','my_plan_id','enforce_tournament_plan_limit',
                        'prevent_plan_self_upgrade')
      order by proname`
  );
  console.log('functions:', fns.map((r) => r.proname).join(', '));

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
