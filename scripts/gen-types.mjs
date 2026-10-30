// Gera types/database.generated.ts a partir do banco, com o MESMO gerador do
// `supabase gen types typescript` (pacote @supabase/typegen), sem Docker nem
// login no Supabase — só a conexão direta (SUPABASE_DB_URL).
//
//   node --env-file=.env.local scripts/gen-types.mjs
//
// Precisa de `pg` e `@supabase/typegen` resolvíveis: use
//   npm i pg @supabase/typegen --no-save
// ou aponte TYPEGEN_FROM para uma pasta que já os tenha (ex.: ../pgtool, que
// também tem o @supabase/postgres-meta, do qual o typegen vem como dependência).
//
// Rodar depois de toda migration que mude tabela, coluna, enum ou função em
// public, e commitar o arquivo gerado junto com a migration.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Generate types for a pending migration without publishing it to the database.
// Usage: ... scripts/gen-types.mjs --migration <filename.sql>
const migrationFile = process.argv[2] === '--migration' ? process.argv[3] : undefined;
if (process.argv[2] && (!migrationFile || !/^\d+_[a-z0-9_]+\.sql$/.test(migrationFile))) {
  throw new Error('Uso: gen-types.mjs [--migration <arquivo.sql de supabase/migrations>]');
}
const from = process.env.TYPEGEN_FROM ? resolve(process.env.TYPEGEN_FROM) : join(here, '..');
const req = createRequire(join(from, 'package.json'));
const { Client } = req('pg');
const typegen = req('@supabase/typegen');

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Precisa de SUPABASE_DB_URL (node --env-file=.env.local scripts/gen-types.mjs).');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  if (migrationFile) {
    await client.query('begin');
    await client.query(readFileSync(join(here, '..', 'supabase', 'migrations', migrationFile), 'utf8'));
  }
  const queryable = { query: async (sql, params) => client.query(sql, params) };
  const metadata = await typegen.introspect(queryable, { includedSchemas: ['public'] });
  const language = typegen.findLanguage('typescript');
  // Sem `format`: usa o oxfmt (o formatador padrão do gerador oficial), então o arquivo sai
  // no mesmo formato que `supabase gen types` produz e o diff do git mostra só mudança real.
  const host = { cwd: process.cwd(), env: process.env };
  // generate() já valida e aplica os padrões das opções; mantém a versão do PostgREST
  // que o arquivo anterior declarava (PGRST_VERSION, padrão 14.5), para o supabase-js casar as opções.
  const values = { 'postgrest-version': process.env.PGRST_VERSION ?? '14.5' };
  const code = await language.generate(metadata, values, host);
  const target = join(here, '..', 'types', 'database.generated.ts');
  writeFileSync(target, code.endsWith('\n') ? code : code + '\n');
  console.log(`Gerado ${target} (${code.split('\n').length} linhas).`);
} finally {
  try {
    if (migrationFile) await client.query('rollback');
  } finally {
    await client.end();
  }
}
