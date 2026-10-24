// Confere os arquivos de supabase/migrations contra o registro do banco
// (supabase_migrations.schema_migrations). Só leitura. Sai com código 1 se achar diferença.
//
//   node --env-file=.env.local scripts/check-migrations.mjs
//
// Procura: versão repetida entre arquivos, nome fora do padrão, arquivo sem registro
// (nunca aplicado, ou aplicado sem registrar), registro sem arquivo (migration aplicada
// por fora, ex.: pelo painel ou pelo MCP) e nome diferente entre arquivo e registro.

import { Client } from 'pg';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Precisa de SUPABASE_DB_URL (node --env-file=.env.local scripts/check-migrations.mjs).');
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const problems = [];

const byVersion = new Map();
for (const f of files) {
  const m = f.match(/^(\d+)_(.+)\.sql$/);
  if (!m) { problems.push(`nome fora do padrão <versão>_<nome>.sql: ${f}`); continue; }
  if (byVersion.has(m[1])) problems.push(`versão repetida ${m[1]}: ${byVersion.get(m[1]).file} e ${f}`);
  byVersion.set(m[1], { file: f, name: m[2] });
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query('select version, name from supabase_migrations.schema_migrations order by version');
await client.end();
const registered = new Map(rows.map((r) => [r.version, r.name]));

for (const [version, { file, name }] of byVersion) {
  if (!registered.has(version)) problems.push(`sem registro no banco: ${file}`);
  else if (registered.get(version) !== name) problems.push(`nome diferente em ${version}: arquivo "${name}" x registro "${registered.get(version)}"`);
}
for (const [version, name] of registered) {
  if (!byVersion.has(version)) problems.push(`registrada sem arquivo: ${version}_${name}`);
}

console.log(`arquivos: ${files.length} | registradas: ${rows.length}`);
if (problems.length) {
  console.log(`\n${problems.length} problema(s):`);
  for (const p of problems) console.log(' -', p);
  process.exit(1);
}
console.log('OK: todos os arquivos estão registrados e todo registro tem arquivo.');
