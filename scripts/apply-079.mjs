// Aplica supabase/migrations/079_player_hub_capacity_checkin.sql em uma
// transação. Uso: node --env-file=.env.local scripts/apply-079.mjs

import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const dryRun = process.argv.includes('--dry-run');
if (!connectionString) {
  console.error('Faltou SUPABASE_DB_URL (ou DATABASE_URL).');
  process.exit(1);
}

const sql = readFileSync(join(scriptDir, '..', 'supabase', 'migrations', '079_player_hub_capacity_checkin.sql'), 'utf8');
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
const expectedColumns = [
  ['tournaments', 'max_participants'], ['tournaments', 'waitlist_enabled'],
  ['tournaments', 'checkin_enabled'], ['tournament_registrations', 'user_id'],
  ['tournament_registrations', 'is_waitlisted'], ['tournament_registrations', 'promoted_at'],
  ['tournament_players', 'checkin_status'],
];
const expectedFunctions = ['allocate_registration_capacity', 'promote_tournament_waitlist', 'set_my_checkin', 'set_player_checkin'];

await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  if (dryRun) {
    await client.query('rollback');
    console.log('Migration 079 validada e revertida (--dry-run).');
  } else {
    await client.query('commit');
    console.log('Migration 079 aplicada e commitada.');
    for (const [table, column] of expectedColumns) {
      const { rowCount } = await client.query('select 1 from information_schema.columns where table_name=$1 and column_name=$2', [table, column]);
      console.log(`${table}.${column}: ${rowCount === 1 ? 'ok' : 'FALTANDO'}`);
    }
    const { rows } = await client.query('select proname from pg_proc where proname = any($1)', [expectedFunctions]);
    const found = new Set(rows.map((row) => row.proname));
    for (const name of expectedFunctions) console.log(`${name}(): ${found.has(name) ? 'ok' : 'FALTANDO'}`);
  }
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  console.error('Falhou; rollback feito:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
