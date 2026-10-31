// Transaction-only proof: no schema/data changes or broadcasts are committed.
// node --env-file=.env.local scripts/test-tv-realtime.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const tournament = 'fd807e1a-0b12-4f4a-b755-ae9112148d30';
const topic = `tournament-tv:${tournament}`;
const migration = new URL('../supabase/migrations/20261031114547_unlisted_tv_native_status.sql', import.meta.url);
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL });
const warnings = [];
client.on('notice', (notice) => { if (notice.severity === 'WARNING') warnings.push(notice.message); });
await client.connect();
// An idle Realtime project provisions its managed daily message partitions when
// the first viewer connects. Warm up without sending/committing any message.
const realtime = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const channel = realtime.channel(`tv-audit:${crypto.randomUUID()}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 10_000);
    channel.on('broadcast', { event: 'changed' }, () => {}).subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`Realtime ${status}`)); }
    });
  });
} finally {
  await realtime.removeAllChannels();
  realtime.realtime.disconnect();
}
const q = async (sql, args = []) => (await client.query(sql, args)).rows;
const schema = () => q(`select pg_get_functiondef(p.oid) as definition,p.proacl::text as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('notify_tournament_tv','get_tournament_page_data')
  order by p.proname`);
const snapshot = async () => {
  const data = {};
  for (const table of ['tournaments', 'rounds', 'pairings', 'standings', 'tournament_players', 'audit_log']) {
    data[table] = await q(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'')) as hash
      from public.${table} r where ${table === 'tournaments' ? 'id' : 'tournament_id'}=$1`, [tournament]);
  }
  return data;
};
const messages = async () => Number((await q('select count(*) as n from realtime.messages where topic=$1', [topic]))[0].n);
const beforeSchema = await schema(), beforeData = await snapshot(), beforeMessages = await messages();
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
async function change(sql, args, delta, label) {
  const before = await messages();
  await q(sql, args);
  eq(await messages() - before, delta, `${label}; broadcast warnings: ${warnings.join('; ')}`);
}
try {
  const [fixture] = await q('select slug,is_public,mode,created_by from tournaments where id=$1', [tournament]);
  assert.ok(fixture && !fixture.is_public && fixture.mode === 'native' && fixture.slug.startsWith('teste-'));
  await q('begin');
  await q("set local lock_timeout='3s'; set local statement_timeout='30s'");
  await q(readFileSync(migration, 'utf8'));
  const firstSchema = await schema();
  await q(readFileSync(migration, 'utf8'));
  eq(await schema(), firstSchema, 'migration is idempotent');
  await q("select set_config('request.jwt.claim.sub',$1,true)", [fixture.created_by]);
  const [round] = await q('select id from rounds where tournament_id=$1 order by round_number limit 1', [tournament]);
  const boards = await q('select id from pairings where round_id=$1 and black_tp_id is not null order by board_number', [round.id]);
  assert.ok(boards.length >= 2);
  // A fully entered round is NOT a finished native tournament. Same lifecycle
  // for app tournaments; retain the legacy imported effective-status behavior.
  await q("update tournaments set status='ongoing' where id=$1", [tournament]);
  await q("update rounds set status='finished' where tournament_id=$1", [tournament]);
  await q("update rounds set status='ongoing' where id=$1", [round.id]);
  await q("update pairings set result='1-0',white_points=1,black_points=0 where tournament_id=$1 and result='*'", [tournament]);
  const pageStatus = async () => (await q('select effective_status from get_tournament_page_data($1)', [fixture.slug]))[0].effective_status;
  for (const [mode, expected] of [['native', 'ongoing'], ['app', 'ongoing'], ['imported', 'finished']]) {
    await q('update tournaments set mode=$2 where id=$1', [tournament, mode]);
    eq(await pageStatus(), expected, `${mode}: completed scores do not override native/app lifecycle`);
  }
  await q("update tournaments set mode='native',status='finished' where id=$1", [tournament]);
  eq(await pageStatus(), 'finished', 'explicit tournament closure remains finished');
  await q("update tournaments set status='ongoing' where id=$1", [tournament]);
  await q("update rounds set status='finished' where id=$1", [round.id]);
  eq(await pageStatus(), 'ongoing', 'between rounds remains ongoing until the tournament is closed');
  await q("update rounds set status='draft',published_at=null where tournament_id=$1", [tournament]);
  await change("update tournaments set status='ongoing',is_public=true where id=$1", [tournament], 1, 'public TV visibility change invalidates');
  await change("update pairings set result='1-0',white_points=1,black_points=0 where id=$1", [boards[0].id], 0, 'draft result never broadcasts');
  await change("update rounds set status='ongoing' where id=$1", [round.id], 1, 'publication broadcasts');
  for (const [result, white, black] of [['1-0', 1, 0], ['0-1', 0, 1], ['1/2-1/2', 0.5, 0.5], ['forfeit_black', 1, 0], ['double_forfeit', 0, 0], ['*', null, null]]) {
    await change('update pairings set result=$2::game_result,white_points=$3,black_points=$4 where id=$1', [boards[0].id, result, white, black], 1, `${result} broadcasts only an invalidation`);
  }
  await change('delete from pairings where id=$1', [boards[1].id], 1, 'deleting a published board broadcasts');
  await change("update rounds set status='finished' where id=$1", [round.id], 1, 'finishing broadcasts');
  await change("update rounds set status='draft' where id=$1", [round.id], 1, 'returning to draft invalidates immediately');
  await change('update pairings set board_number=board_number where id=$1', [boards[0].id], 0, 'draft edits remain silent');

  await q("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{\"role\":\"anon\"}',true)");
  await q('set local role anon');
  eq((await q('select id from rounds where id=$1', [round.id])).length, 0, 'anonymous viewer cannot read draft round');
  eq((await q('select * from get_round_pairings($1)', [round.id])).length, 0, 'anonymous RPC cannot read draft pairings');
  eq((await q("select has_function_privilege('anon','public.notify_tournament_tv()','EXECUTE') as allowed"))[0].allowed, false, 'anonymous cannot invoke privileged trigger');
  await q('reset role');
  await q("select set_config('request.jwt.claim.sub',$1,true)", [fixture.created_by]);
  await change("update rounds set status='ongoing' where id=$1", [round.id], 1, 'republication broadcasts');
  await change('delete from rounds where id=$1', [round.id], 1, 'deleting round broadcasts even after cascading boards');
  await change('update tournaments set is_public=false where id=$1', [tournament], 1, 'removing public listing does not disable TV invalidation');
  await change("update tournaments set name=name where id=$1", [tournament], 1, 'unlisted tournament TV remains live by direct link');
  await change("update tournaments set status='draft' where id=$1", [tournament], 1, 'returning the tournament to draft invalidates open TV screens');
  await change("update tournaments set name=name where id=$1", [tournament], 0, 'draft tournament changes remain silent');
  const payloads = await q('select payload from realtime.messages where topic=$1', [topic]);
  assert.ok(payloads.length > 0);
  // The installed Realtime version adds a generated message id to the empty payload.
  for (const row of payloads) eq(Object.keys(row.payload).filter((key) => key !== 'id'), [], 'no row data/names/scores in public signal');
  console.log(`PASS ${checks} checks: TV lifecycle, results, anonymous draft isolation, empty public payloads`);
} finally {
  await q('rollback');
  try {
    eq(await schema(), beforeSchema, 'original function/ACL restored');
    eq(await snapshot(), beforeData, 'fixture and historical data unchanged');
    eq(await messages(), beforeMessages, 'no test broadcast committed');
    console.log('ROLLBACK VERIFIED: schema, fixture and message journal unchanged');
  } finally { await client.end(); }
}
