// One-off: cria torneio importado "FESTIVAL DA CRIANCA E JUVENTUDE 2026 - ETAPA 04 DOURADOS"
// com as 7 divisões como grupos de emparceiramento (mode='imported').
// Rodar: node --env-file=.env.local scripts/import-festival-crianca-dourados.mjs
import pg from 'pg';

const { Client } = pg;

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

const NAME = 'FESTIVAL DA CRIANCA E JUVENTUDE 2026 - ESTADO DO MS ETAPA 04 - DOURADOS';
const START = '2026-08-15';
const ADMIN_EMAIL = 'guigomes.ti@gmail.com';

const DIVISIONS = [
  { group: 'SUB9MISTO',  tnr: '1449174' },
  { group: 'SUB11MISTO', tnr: '1449184' },
  { group: 'SUB13FEM',   tnr: '1449189' },
  { group: 'SUB13MASC',  tnr: '1449187' },
  { group: 'SUB15FEM',   tnr: '1449192' },
  { group: 'SUB15MASC',  tnr: '1449191' },
  { group: 'SUB17MISTO', tnr: '1449195' },
];
const urlFor = (tnr) => `https://chess-results.com/tnr${tnr}.aspx?lan=10`;

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // 0. admin uid
  const uid = (await client.query(
    'select id from auth.users where email = $1', [ADMIN_EMAIL],
  )).rows[0]?.id;
  if (!uid) throw new Error(`admin ${ADMIN_EMAIL} não encontrado em auth.users`);

  // guarda de idempotência: alguma das 7 URLs já cadastrada?
  const urls = DIVISIONS.map((d) => urlFor(d.tnr));
  const dup = await client.query(
    'select base_url from tournament_imports where base_url = any($1)', [urls],
  );
  if (dup.rows.length) {
    console.log('JÁ EXISTE — abortando. base_urls já cadastradas:',
      dup.rows.map((r) => r.base_url).join(', '));
    return;
  }

  const slug = `${slugify(NAME)}-${START.replace(/-/g, '')}`;

  await client.query('begin');
  try {
    const t = (await client.query(
      `insert into tournaments
         (slug, name, city, state, organizer_name, chief_arbiter,
          time_control, tournament_type, start_date, rounds_count,
          is_public, mode, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,'swiss',$8,7,false,'imported',$9)
       returning id, slug`,
      [slug, NAME, 'Dourados', 'MS', 'FESMAX', 'AR INACIO CLACIER ROEDER',
       '15 KO ou 10 + 5', START, uid],
    )).rows[0];

    for (const d of DIVISIONS) {
      await client.query(
        `insert into tournament_imports
           (tournament_id, base_url, pairing_group_name, enabled)
         values ($1,$2,$3,true)`,
        [t.id, urlFor(d.tnr), d.group],
      );
    }
    await client.query('commit');
    console.log('OK — torneio criado:', t.slug, `(id ${t.id})`);
    console.log(`${DIVISIONS.length} linhas tournament_imports habilitadas.`);
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

main()
  .catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; })
  .finally(() => client.end());
