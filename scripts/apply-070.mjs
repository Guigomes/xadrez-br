// Aplica supabase/migrations/070_series_standings.sql via conexão direta
// Postgres (mesmo padrão de apply-048..069.mjs). Exige a 069 já aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-070.mjs
//   (ou: node --env-file=.env.local scripts/apply-070.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '070_series_standings.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const EXPECTED_FNS = [
  '_recalculate_series_standings',
  '_tournament_tiebreak_sql',
  'add_tournament_to_series',
  'get_series_player_breakdown',
  'get_series_scopes',
  'get_series_standings',
  'recalculate_series_standings',
  'remove_tournament_from_series',
  'series_identity_key',
  'set_series_points_rules',
];

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 070_series_standings.sql em uma transação…');

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

  const { rows: fns } = await client.query(
    `select proname from pg_proc where proname = any($1) order by proname`,
    [EXPECTED_FNS]
  );
  const found = fns.map((r) => r.proname);
  const missing = EXPECTED_FNS.filter((f) => !found.includes(f));

  const { rows: trg } = await client.query(`
    select tgname from pg_trigger
    where tgname = 'trg_recalc_series_on_finish' and not tgisinternal
  `);

  console.log(`functions (esperado ${EXPECTED_FNS.length}):`, found.length);
  if (missing.length > 0) console.log('FALTANDO:', missing.join(', '));
  console.log('trigger trg_recalc_series_on_finish:', trg.length === 1 ? 'ok' : 'NÃO — algo deu errado');

  // Smoke read-only: a função de leitura roda sem série nenhuma (0 linhas).
  const { rows: smoke } = await client.query(
    `select count(*)::int as n from get_series_scopes('00000000-0000-0000-0000-000000000000')`
  );
  console.log('get_series_scopes com uuid inexistente:', smoke[0].n === 0 ? 'ok (0 linhas)' : smoke[0].n);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
