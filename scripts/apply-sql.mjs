// Aplica uma migration de supabase/migrations numa transação, via conexão direta Postgres,
// e a REGISTRA em supabase_migrations.schema_migrations na mesma transação (ou as duas
// coisas acontecem, ou nenhuma) — o registro é o que `supabase migration list` e
// scripts/check-migrations.mjs usam para saber o que já foi aplicado.
//
// Uso:
//   node --env-file=.env.local scripts/apply-sql.mjs <arquivo.sql> [objeto ...]
//   node --env-file=.env.local scripts/apply-sql.mjs --register-only <arquivo.sql> [...]
// Os objetos listados depois do arquivo (tabelas/views) são conferidos ao final (to_regclass).
// --register-only só grava o registro, SEM rodar o SQL: use apenas para migration que já
// foi aplicada por outro meio (conferir antes com scripts/check-migrations.mjs).

import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const registerOnly = args[0] === '--register-only';
if (registerOnly) args.shift();
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!args.length || !connectionString) {
  console.error('Uso: node --env-file=.env.local scripts/apply-sql.mjs [--register-only] <arquivo.sql> [objeto ...] (precisa de SUPABASE_DB_URL)');
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = registerOnly ? args : [args[0]];
const checks = registerOnly ? [] : args.slice(1);

const parse = (file) => {
  const m = file.match(/^(\d+)_(.+)\.sql$/);
  if (!m) throw new Error(`Nome fora do padrão <versão>_<nome>.sql: ${file}`);
  return { version: m[1], name: m[2] };
};

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query('begin');
try {
  for (const file of files) {
    const { version, name } = parse(file);
    const sql = readFileSync(join(dir, file), 'utf8');
    const { rows } = await client.query('select 1 from supabase_migrations.schema_migrations where version = $1', [version]);
    if (rows.length) {
      console.log(`${file}: já registrada, nada a fazer.`);
      continue;
    }
    if (!registerOnly) {
      console.log(`Aplicando ${file} em uma transação…`);
      await client.query(sql);
    }
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
       values ($1, $2, $3, $4)`,
      [version, name, [sql], registerOnly ? 'registro-retroativo (apply-sql --register-only)' : 'apply-sql.mjs'],
    );
    console.log(`${file}: ${registerOnly ? 'registrada' : 'aplicada e registrada'}.`);
  }
  await client.query('commit');
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
