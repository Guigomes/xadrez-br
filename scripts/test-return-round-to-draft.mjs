// Rollback-only test of the explicit return action on an existing private audit fixture.
// node --env-file=.env.local scripts/test-return-round-to-draft.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const tid = 'fd807e1a-0b12-4f4a-b755-ae9112148d30';
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const schema = () => q(`select proname,md5(pg_get_functiondef(oid)) as hash,proacl::text as acl
  from pg_proc where oid in (
    to_regprocedure('public.return_round_to_draft(uuid,boolean)'),
    to_regprocedure('public.set_pairing_result(uuid,public.game_result)'),
    to_regprocedure('public.override_pairing_players(uuid,jsonb,text)')) order by proname`);
async function snapshot() {
  const data = {};
  for (const table of ['tournaments', 'rounds', 'pairings', 'standings', 'tournament_players', 'tournament_registrations', 'audit_log']) {
    data[table] = await q(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'')) as hash
      from public.${table} r where ${table === 'tournaments' ? 'id' : 'tournament_id'}=$1`, [tid]);
  }
  data.pgns = await q(`select md5(coalesce(jsonb_agg(to_jsonb(g) order by g.pairing_id)::text,'')) as hash
    from pairing_pgns g join pairings p on p.id=g.pairing_id where p.tournament_id=$1`, [tid]);
  data.policies = await q("select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='pairings' order by policyname");
  return data;
}
async function rejects(sql, args, pattern) {
  await q('savepoint rejection');
  try { await assert.rejects(() => q(sql, args), pattern); checks++; }
  finally { await q('rollback to savepoint rejection'); await q('release savepoint rejection'); }
}
const beforeSchema = await schema(), beforeData = await snapshot();
try {
  const [fixture] = await q('select slug,is_public,mode,created_by from tournaments where id=$1', [tid]);
  assert.ok(fixture && !fixture.is_public && fixture.mode === 'native' && fixture.slug.startsWith('teste-'));
  await q('begin');
  await q("set local lock_timeout='3s'; set local statement_timeout='30s'");
  for (const file of ['20261030214042_live_standings_and_draft_pairing_edits.sql', '20261030220941_return_round_to_draft.sql']) {
    await q(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  await q("select set_config('request.jwt.claim.sub',$1,true)", [fixture.created_by]);
  const rounds = await q('select id,round_number from rounds where tournament_id=$1 order by round_number', [tid]);
  const last = rounds.at(-1), earlier = rounds.at(-2);
  const seats = () => q('select id,white_tp_id,black_tp_id,is_bye,bye_kind from pairings where round_id=$1 order by id', [last.id]);
  const initialSeats = await seats();
  const [board] = await q('select id from pairings where round_id=$1 and not is_bye order by board_number limit 1', [last.id]);
  const pgn = '[Event "Private rollback test"]\n\n1. e4 e5 *';
  await q("insert into pairing_pgns(pairing_id,pgn,source) values ($1,$2,'manual') on conflict (pairing_id) do update set pgn=excluded.pgn", [board.id, pgn]);
  const [initial] = await q("select count(*)::integer as results from pairings where round_id=$1 and not is_bye and result<>'*'", [last.id]);
  const rpc = 'select return_round_to_draft($1,$2) as discarded';
  eq((await q("select has_function_privilege('anon','public.return_round_to_draft(uuid,boolean)','execute') as allowed"))[0].allowed, false, 'anonymous cannot execute');
  eq((await q("select has_function_privilege('authenticated','public.return_round_to_draft(uuid,boolean)','execute') as allowed"))[0].allowed, true, 'authenticated callers reach authorization gate');
  await rejects(rpc, [earlier.id, true], /NEXT_ROUND_EXISTS/);
  await rejects(rpc, [last.id, false], /RESULTS_CONFIRMATION_REQUIRED/);
  eq((await q('select status from rounds where id=$1', [last.id]))[0].status, 'finished', 'rejected confirmation leaves state unchanged');

  await q("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)");
  await rejects(rpc, [last.id, true], /FORBIDDEN/);
  await q("select set_config('request.jwt.claim.sub',$1,true)", [fixture.created_by]);
  await q('set local role authenticated');
  eq((await q(rpc, [last.id, true]))[0].discarded, initial.results, 'confirmation permits removal of existing results');
  eq((await q('select status,published_at from rounds where id=$1', [last.id]))[0], { status: 'draft', published_at: null }, 'round returned to editable unpublished draft');
  eq((await q("select count(*)::integer as remaining from pairings where round_id=$1 and not is_bye and (result<>'*' or white_points is not null or black_points is not null)", [last.id]))[0].remaining, 0, 'entered results cleared');
  eq(await seats(), initialSeats, 'seats and byes preserved');
  eq((await q('select pgn from pairing_pgns where pairing_id=$1', [board.id]))[0].pgn, pgn, 'PGN preserved');
  eq((await q('select status from tournaments where id=$1', [tid]))[0].status, 'ongoing', 'finished tournament reopened');
  eq((await q('select sum(points)::float8 as points from standings where tournament_id=$1', [tid]))[0].points, 50, 'standings retain the five earlier rounds only');
  eq((await q("select payload->>'discarded_results_count' as count,jsonb_array_length(payload->'discarded_results') as details from audit_log where entity_id=$1 and action='return_round_to_draft' order by id desc limit 1", [last.id]))[0], { count: String(initial.results), details: initial.results }, 'audit keeps the removed results');
  eq((await q(rpc, [last.id, false]))[0].discarded, 0, 'retry is idempotent');

  await q('select publish_round($1)', [last.id]);
  await q("select set_pairing_result($1,'1-0')", [board.id]);
  await rejects(rpc, [last.id, false], /RESULTS_CONFIRMATION_REQUIRED/);
  eq((await q('select result from pairings where id=$1', [board.id]))[0].result, '1-0', 'late result is not silently discarded');
  await q(rpc, [last.id, true]);
  await q('select publish_round($1)', [last.id]);
  eq((await q(rpc, [last.id, false]))[0].discarded, 0, 'no-result round can return without destructive acknowledgement');
  await q('reset role');

  // Isolated bye fixture: predetermined bye must survive a return, but its
  // point must disappear from standings while the round is a draft.
  await q('select publish_round($1)', [last.id]);
  await q("update pairings set is_bye=true,bye_kind='pairing',black_tp_id=null,result='bye',white_points=1,black_points=null where id=$1", [board.id]);
  const [byeBefore] = await q('select to_jsonb(p) as value from pairings p where id=$1', [board.id]);
  await q(rpc, [last.id, false]);
  eq((await q('select to_jsonb(p) as value from pairings p where id=$1', [board.id]))[0], byeBefore, 'predetermined bye untouched');
  eq((await q('select sum(points)::float8 as points from standings where tournament_id=$1', [tid]))[0].points, 50, 'unpublished bye not included in standings');
  eq((await q('select count(*)::integer as mismatches from standings s join tournament_players tp on tp.id=s.tournament_player_id where s.tournament_id=$1 and (s.points is distinct from tp.current_score or s.rank is distinct from tp.current_rank)', [tid]))[0].mismatches, 0, 'score/rank cache synchronized');
  console.log(`PASS ${checks} checks: confirmation, permissions, publication reversal, cleared results, preservation and recalculation`);
} finally {
  await q('rollback');
  try {
    eq(await schema(), beforeSchema, 'schema and function grants restored');
    eq(await snapshot(), beforeData, 'fixture, PGNs, audit and policies restored');
    console.log('ROLLBACK VERIFIED: no persistent schema or fixture changes');
  } finally { await client.end(); }
}
