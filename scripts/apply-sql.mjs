// Aplica uma migration de supabase/migrations numa transação, via conexão direta Postgres.
//
// Uso:
//   node --env-file=.env.local scripts/apply-sql.mjs <arquivo.sql> [tabela ...]
// As tabelas/funções listadas depois do arquivo são conferidas ao final (to_regclass / to_regproc).

import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [file, ...checks] = process.argv.slice(2);
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!file || !connectionString) {
  console.error('Uso: node --env-file=.env.local scripts/apply-sql.mjs <arquivo.sql> [objeto ...] (precisa de SUPABASE_DB_URL)');
  process.exit(1);
}

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', file), 'utf8');
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

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
  await client.end();
  process.exit(1);
}
for (const obj of checks) {
  const { rows: [r] } = await client.query('select to_regclass($1) as rel', [`public.${obj}`]);
  console.log(`${obj}:`, r.rel ? 'ok' : 'NÃO existe — confira');
}
await client.end();
