// Private audit fixture only. All schema/data changes are rolled back.
// node --env-file=.env.local scripts/test-live-standings.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const tournament = 'fd807e1a-0b12-4f4a-b755-ae9112148d30';
const migration = new URL('../supabase/migrations/20261030214042_live_standings_and_draft_pairing_edits.sql', import.meta.url);
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL });
await client.connect();
const q = async (sql, args = []) => (await client.query(sql, args)).rows;
const functions = () => q(`select proname,md5(pg_get_functiondef(oid)) as hash,proacl::text as acl,
  pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as result
  from pg_proc where oid in ('public.override_pairing_players(uuid,jsonb,text)'::regprocedure,
  'public.set_pairing_result(uuid,public.game_result)'::regprocedure) order by proname`);
const snapshot = async () => {
  const hashes = {};
  for (const table of ['rounds', 'pairings', 'standings', 'tournament_players', 'audit_log']) {
    hashes[table] = await q(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'')) as hash
      from public.${table} r where tournament_id=$1`, [tournament]);
  }
  return hashes;
};
const beforeFunctions = await functions(), beforeData = await snapshot();
const policies = () => q("select policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='pairings' order by policyname");
const beforePolicies = await policies();
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
async function rejects(sql, args, pattern) {
  await q('savepoint denied');
  try { await assert.rejects(() => q(sql, args), pattern); checks++; }
  finally { await q('rollback to savepoint denied'); await q('release savepoint denied'); }
}
try {
  const [fixture] = await q('select slug,is_public,mode,created_by from tournaments where id=$1', [tournament]);
  assert.ok(fixture && !fixture.is_public && fixture.mode === 'native' && fixture.slug.startsWith('teste-'));
  await q('begin');
  await q("set local lock_timeout='3s'; set local statement_timeout='30s'");
  await q(readFileSync(migration, 'utf8'));
  eq((await functions()).map(({ args, result, acl }) => ({ args, result, acl })),
    beforeFunctions.map(({ args, result, acl }) => ({ args, result, acl })), 'signature and ACL compatibility');
  await q("select set_config('request.jwt.claim.sub',$1,true)", [fixture.created_by]);
  const [round] = await q('select id from rounds where tournament_id=$1 and round_number=1', [tournament]);
  await q("update rounds set status=case when round_number=1 then 'ongoing'::round_status else 'draft'::round_status end where tournament_id=$1", [tournament]);
  await q("update pairings set result='*',white_points=null,black_points=null where round_id=$1", [round.id]);
  await q('select recalculate_standings($1)', [tournament]);
  const boards = await q('select id,white_tp_id,black_tp_id from pairings where round_id=$1 order by board_number', [round.id]);
  const [a, b] = boards;
  const result = (id, value) => q('select set_pairing_result($1,$2::game_result)', [id, value]);
  const points = async () => (await q('select sum(points)::float8 as points,sum(games_played)::integer as games from standings where tournament_id=$1', [tournament]))[0];
  const player = async (tp) => (await q('select points::float8, rank from standings where tournament_player_id=$1', [tp]))[0];

  await result(a.id, '1-0');
  eq(await points(), { points: 1, games: 2 }, 'ongoing result immediately recalculates');
  eq((await player(a.white_tp_id)).points, 1, 'winner points');
  eq((await player(a.white_tp_id)).rank, 1, 'winner immediately ranked first');
  eq((await q('select status from rounds where id=$1', [round.id]))[0].status, 'ongoing', 'round not closed');
  await result(b.id, '1/2-1/2');
  eq(await points(), { points: 2, games: 4 }, 'partial draw counted');
  await result(a.id, '0-1');
  eq((await player(a.white_tp_id)).points, 0, 'correction removes former winner point');
  eq((await player(a.black_tp_id)).points, 1, 'correction credits new winner');
  eq((await player(a.black_tp_id)).rank, 1, 'correction immediately reorders standings');
  await result(a.id, '*');
  eq(await points(), { points: 1, games: 2 }, 'clearing removes only that game');
  await result(b.id, '*');
  await result(a.id, 'forfeit_black');
  eq(await points(), { points: 1, games: 0 }, 'WO scores without counting an OTB game');
  await result(a.id, 'double_forfeit');
  eq(await points(), { points: 0, games: 0 }, 'double WO remains a zero-score recorded result');
  eq((await q("select exists(select 1 from pairings p join rounds r on r.id=p.round_id where p.tournament_id=$1 and p.result<>'*' and r.status<>'draft') as recorded", [tournament]))[0].recorded, true, 'zero-point result metadata');
  eq((await q(`select count(*)::integer as mismatches from standings s join tournament_players tp on tp.id=s.tournament_player_id
    where s.tournament_id=$1 and (s.points is distinct from tp.current_score or s.rank is distinct from tp.current_rank
      or s.buchholz is distinct from tp.buchholz or s.sonneborn_berger is distinct from tp.sonneborn_berger)`, [tournament]))[0].mismatches, 0, 'participant cache in sync');
  eq((await q('select points::float8 from get_tournament_standings($1) where tp_id=$2', [tournament, a.white_tp_id]))[0].points, 0, 'public standings RPC sees current score');

  await q('set local role authenticated');
  eq((await q('update pairings set white_tp_id=black_tp_id,black_tp_id=white_tp_id where id=$1 returning id', [a.id])).length, 0, 'Data API cannot bypass the published-seat lock');
  eq((await q('select id from pairings where id=$1', [a.id])).length, 1, 'published board remains readable');
  await result(a.id, '1-0');
  eq((await player(a.white_tp_id)).points, 1, 'authenticated result RPC still works through the lock');
  await q('reset role');

  const moves = [{ pairing_id: a.id, white_tp: a.black_tp_id, black_tp: a.white_tp_id }];
  const overrideSql = 'select override_pairing_players($1,$2::jsonb,$3)';
  const overrideArgs = [round.id, JSON.stringify(moves), 'Teste privado'];
  for (const status of ['ongoing', 'finished']) {
    await q('update rounds set status=$2::round_status where id=$1', [round.id, status]);
    await rejects(overrideSql, overrideArgs, /INVALID_STATE.*publicar/);
  }
  await q("update rounds set status='draft',published_at=now() where id=$1", [round.id]);
  await rejects(overrideSql, overrideArgs, /INVALID_STATE.*publicar/);
  await rejects('select set_pairing_result($1,$2::game_result)', [a.id, '1-0'], /ainda não publicada/);
  await q('update rounds set published_at=null where id=$1', [round.id]);
  await q(overrideSql, overrideArgs);
  eq((await q('select white_tp_id,black_tp_id from pairings where id=$1', [a.id]))[0],
    { white_tp_id: a.black_tp_id, black_tp_id: a.white_tp_id }, 'draft color swap allowed');
  const whiteSwap = [
    { pairing_id: a.id, white_tp: b.white_tp_id, black_tp: a.white_tp_id },
    { pairing_id: b.id, white_tp: a.black_tp_id, black_tp: b.black_tp_id },
  ];
  await q(overrideSql, [round.id, JSON.stringify(whiteSwap), 'Troca entre mesas']);
  eq((await q('select white_tp_id from pairings where id=$1', [a.id]))[0].white_tp_id, b.white_tp_id, 'same-color cross-board swap passes unique indexes');
  await rejects(overrideSql, [round.id, JSON.stringify([{ pairing_id: a.id, white_tp: boards[2].white_tp_id, black_tp: a.white_tp_id }]), 'Duplicação'], /duplicate key|INVALID_MOVES/);

  await q("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)");
  await rejects(overrideSql, overrideArgs, /FORBIDDEN/);
  await rejects('select set_pairing_result($1,$2::game_result)', [a.id, '1-0'], /FORBIDDEN/);
  console.log(`PASS ${checks} checks: live scores, corrections, clearing, WO, draft-only swaps and authorization`);
} finally {
  await q('rollback');
  try {
    eq(await functions(), beforeFunctions, 'original functions/ACLs restored');
    eq(await policies(), beforePolicies, 'original RLS policies restored');
    eq(await snapshot(), beforeData, 'all fixture data restored');
    console.log('ROLLBACK VERIFIED: original schema and private fixture unchanged');
  } finally { await client.end(); }
}
