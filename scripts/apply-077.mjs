// Aplica supabase/migrations/077_player_title_and_unpaired.sql via conexão
// direta Postgres (mesmo padrão de apply-048..076.mjs). Exige a 076 já
// aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-077.mjs
//   (ou: node --env-file=.env.local scripts/apply-077.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '077_player_title_and_unpaired.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const EXPECTED_FNS = ['get_tournament_standings', 'get_round_pairings', 'get_player_tournament_history'];

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 077_player_title_and_unpaired.sql em uma transação…');

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

  const { rows: col } = await client.query(
    `select column_name from information_schema.columns where table_name = 'players' and column_name = 'title'`
  );
  console.log('players.title:', col.length === 1 ? 'ok' : 'FALTANDO');

  const { rows: enumVal } = await client.query(
    `select 1 from pg_enum where enumlabel = 'not_paired' and enumtypid = 'game_result'::regtype`
  );
  console.log("game_result 'not_paired':", enumVal.length === 1 ? 'ok' : 'FALTANDO');

  const { rows: fns } = await client.query(
    `select proname from pg_proc where proname = any($1) order by proname`,
    [EXPECTED_FNS]
  );
  const found = fns.map((r) => r.proname);
  const missing = EXPECTED_FNS.filter((f) => !found.includes(f));
  console.log(`functions (esperado ${EXPECTED_FNS.length}):`, found.length);
  if (missing.length > 0) console.log('FALTANDO:', missing.join(', '));

  // Smoke read-only: uuid inexistente devolve 0 linhas, sem explodir.
  const zero = '00000000-0000-0000-0000-000000000000';
  const { rows: s1 } = await client.query(`select count(*)::int as n from get_tournament_standings($1)`, [zero]);
  console.log('get_tournament_standings smoke:', s1[0].n === 0 ? 'ok (0 linhas)' : s1[0].n);
  const { rows: s2 } = await client.query(`select count(*)::int as n from get_round_pairings($1)`, [zero]);
  console.log('get_round_pairings smoke:', s2[0].n === 0 ? 'ok (0 linhas)' : s2[0].n);
  const { rows: s3 } = await client.query(`select count(*)::int as n from get_player_tournament_history($1, $2)`, [zero, zero]);
  console.log('get_player_tournament_history smoke:', s3[0].n === 0 ? 'ok (0 linhas)' : s3[0].n);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
