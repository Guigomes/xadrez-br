// Aplica supabase/migrations/066_rounds_notified_at.sql via conexão direta
// Postgres (mesmo padrão de apply-048..065.mjs).
//
// Uso:
//   SUPABASE_DB_URL="postgres://postgres:<senha>@<host>:5432/postgres" node scripts/apply-066.mjs
//   (ou: node --env-file=.env.local scripts/apply-066.mjs)

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

const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '066_rounds_notified_at.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Conectado. Aplicando 066_rounds_notified_at.sql em uma transação…');

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

  // Verificação: coluna existe e nenhuma rodada ficou com notified_at nulo
  // (o backfill deve ter carimbado todas as pré-existentes).
  const { rows } = await client.query(`
    select is_nullable
    from information_schema.columns
    where table_name = 'rounds' and column_name = 'notified_at'
  `);
  if (rows.length === 0) {
    console.error('ERRO: coluna notified_at não existe depois da migration.');
    process.exit(1);
  }
  console.log(`notified_at: nullable=${rows[0].is_nullable} (esperado YES)`);

  const { rows: pend } = await client.query(
    'select count(*)::int as n from rounds where notified_at is null'
  );
  console.log(`Rodadas sem notified_at logo após aplicar: ${pend[0].n} (esperado 0).`);

  await client.end();
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
