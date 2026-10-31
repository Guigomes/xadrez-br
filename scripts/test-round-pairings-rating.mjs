// Integration proof using a private audit fixture; always rolls back DDL and data.
// node --env-file=.env.local scripts/test-round-pairings-rating.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const tournament = 'fd807e1a-0b12-4f4a-b755-ae9112148d30';
const migration = new URL('../supabase/migrations/20261031110235_round_pairings_tournament_rating.sql', import.meta.url);
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL });
await client.connect();
const q = async (sql, args = []) => (await client.query(sql, args)).rows;
const schema = () => q(`select pg_get_functiondef(oid) as definition, proacl::text as acl,
  pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as result
  from pg_proc where oid='public.get_round_pairings(uuid)'::regprocedure`);
const snapshot = () => q(`select to_jsonb(t) as tournament,
  (select jsonb_agg(to_jsonb(pl) order by pl.id) from players pl
    where pl.id in (select player_id from tournament_players where tournament_id=t.id)) as players,
  (select jsonb_agg(to_jsonb(r) order by r.id) from rounds r where r.tournament_id=t.id) as rounds,
  (select jsonb_agg(to_jsonb(p) order by p.id) from pairings p where p.tournament_id=t.id) as pairings
  from tournaments t where t.id=$1`, [tournament]);
let beforeSchema, beforeData, checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
try {
  const [fixture] = await q('select slug,is_public,mode,created_by from tournaments where id=$1', [tournament]);
  assert.ok(fixture && !fixture.is_public && fixture.mode === 'native' && fixture.slug.startsWith('teste-'), 'Private native audit fixture required');
  beforeSchema = await schema(); beforeData = await snapshot();
  await q('begin');
  await q("set local lock_timeout='3s'; set local statement_timeout='30s'");
  await q(readFileSync(migration, 'utf8'));
  const first = await schema();
  equal(first.map(({ acl, args, result }) => ({ acl, args, result })), beforeSchema.map(({ acl, args, result }) => ({ acl, args, result })), 'signature and grants preserved');
  await q(readFileSync(migration, 'utf8'));
  equal(await schema(), first, 'idempotent migration');
  await q("select set_config('request.jwt.claim.sub',$1,true)", [fixture.created_by]);
  const [board] = await q(`select p.id,p.round_id,w.player_id as white,b.player_id as black
    from pairings p join tournament_players w on w.id=p.white_tp_id
    join tournament_players b on b.id=p.black_tp_id
    where p.tournament_id=$1 and not p.is_bye order by p.round_id,p.board_number limit 1`, [tournament]);
  assert.ok(board && board.white !== board.black, 'Two-player board required');
  await q('update players set rating_std=1801,rating_rpd=1901,rating_blz=2001 where id=$1', [board.white]);
  await q('update players set rating_std=1802,rating_rpd=1902,rating_blz=2002 where id=$1', [board.black]);
  const ratings = async () => (await q('select * from get_round_pairings($1)', [board.round_id])).find(row => row.pairing_id === board.id);
  for (const [kind, white, black] of [['std',1801,1802], ['rpd',1901,1902], ['blz',2001,2002]]) {
    await q('update tournaments set rating_kind=$2::rating_kind where id=$1', [tournament, kind]);
    const row = await ratings();
    equal([row.white_rating,row.black_rating], [white,black], `native ${kind} uses configured ratings for both sides`);
  }
  await q('update players set rating_blz=null where id=$1', [board.white]);
  equal((await ratings()).white_rating, null, 'missing configured rating does not fall back to classical');
  for (const mode of ['imported', 'app']) {
    await q("update tournaments set mode=$2,rating_kind='rpd' where id=$1", [tournament, mode]);
    const row = await ratings();
    equal([row.white_rating,row.black_rating], [1801,1802], `${mode} retains source rating in std`);
  }
  await q("update rounds set status='draft' where id=$1", [board.round_id]);
  await q("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{\"role\":\"anon\"}',true)");
  await q('set local role anon');
  equal(await q('select * from get_round_pairings($1)', [board.round_id]), [], 'anonymous draft isolation preserved');
  await q('reset role');
  console.log(`PASS ${checks} checks: tournament ratings, compatibility and draft isolation`);
} finally {
  try {
    await q('rollback');
    if (beforeSchema) equal(await schema(), beforeSchema, 'original function and grants restored');
    if (beforeData) equal(await snapshot(), beforeData, 'fixture and players unchanged');
    console.log('ROLLBACK VERIFIED: no schema or data changes committed');
  } finally { await client.end(); }
}
