// Aplica supabase/migrations/20261007120000_historical_import_support.sql via
// conexão direta Postgres (mesmo padrão de apply-048..083.mjs).
//
// Uso:
//   node --env-file=.env.local scripts/apply-20261007120000.mjs

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

const file = '20261007120000_historical_import_support.sql';
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', file), 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log(`Conectado. Aplicando ${file} em uma transação…`);

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

  const { rows: [check] } = await client.query(`
    select
      exists (select 1 from information_schema.columns
              where table_name = 'tournaments' and column_name = 'homologated') as homologated,
      to_regclass('public.pairing_pgns') is not null as pairing_pgns,
      to_regprocedure('public.get_player_history(uuid)') is not null as get_player_history,
      has_function_privilege('anon', 'public.get_player_history(uuid)', 'execute') as anon_exec,
      has_table_privilege('anon', 'public.pairing_pgns', 'select') as anon_select
  `);
  console.log('tournaments.homologated:', check.homologated ? 'ok' : 'NÃO — confira');
  console.log('pairing_pgns:', check.pairing_pgns ? 'ok' : 'NÃO — confira');
  console.log('get_player_history:', check.get_player_history ? 'ok' : 'NÃO — confira');
  console.log('anon sem acesso:', !check.anon_exec && !check.anon_select ? 'ok' : 'NÃO — confira');

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
