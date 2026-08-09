// Aplica supabase/migrations/065_absolute_classification.sql via conexão direta
// Postgres (mesmo padrão de apply-048..064.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-065.mjs
//   (ou: node --env-file=.env.local scripts/apply-065.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '065_absolute_classification.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 065_absolute_classification.sql em uma transação…');

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

  // Verificação: a coluna existe, é NOT NULL e o default é true — os torneios
  // que já existem precisam continuar com o absoluto ligado.
  const { rows } = await client.query(`
    select is_nullable, column_default
    from information_schema.columns
    where table_name = 'tournaments' and column_name = 'has_absolute_classification'
  `);
  if (rows.length === 0) {
    console.error('ERRO: coluna has_absolute_classification não existe depois da migration.');
    process.exit(1);
  }
  const { is_nullable, column_default } = rows[0];
  console.log(`has_absolute_classification: nullable=${is_nullable} default=${column_default}`);
  if (is_nullable !== 'NO' || !String(column_default).startsWith('true')) {
    console.error('ERRO: esperado NOT NULL com default true.');
    process.exit(1);
  }

  const { rows: semAbsoluto } = await client.query(
    'select count(*)::int as n from tournaments where has_absolute_classification = false'
  );
  console.log(`Torneios com absoluto desligado: ${semAbsoluto[0].n} (esperado 0 logo após aplicar).`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
