// Aplica supabase/migrations/068_opponent_points.sql via conexão direta
// Postgres (mesmo padrão de apply-048..067.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-068.mjs
//   (ou: node --env-file=.env.local scripts/apply-068.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '068_opponent_points.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 068_opponent_points.sql em uma transação…');

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

  // Verificação: a coluna opponent_points existe no retorno da function agora.
  const { rows } = await client.query(`
    select p.proname, t.typname as return_type
    from pg_proc p
    join pg_type t on t.oid = p.prorettype
    where p.proname = 'get_player_tournament_history'
  `);
  console.log('function encontrada:', rows.length > 0 ? 'sim' : 'NÃO — algo deu errado');

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
