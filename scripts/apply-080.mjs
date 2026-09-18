// Aplica supabase/migrations/080_players_club_state_sync.sql via conexão
// direta Postgres (mesmo padrão de apply-048..079.mjs). Exige a 079 já
// aplicada.
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-080.mjs
//   (ou: node --env-file=.env.local scripts/apply-080.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '080_players_club_state_sync.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 080_players_club_state_sync.sql em uma transação…');

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
    `select column_name from information_schema.columns where table_name = 'players' and column_name = 'club_or_school'`
  );
  console.log('players.club_or_school:', col.length === 1 ? 'ok' : 'FALTANDO');

  const { rows: fns } = await client.query(
    `select proname from pg_proc where proname = 'approve_registration'`
  );
  console.log('approve_registration:', fns.length === 1 ? 'ok' : 'FALTANDO');

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
