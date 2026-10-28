// Integration regression against the two private audit fixtures. All DDL and
// recalculations are rolled back; never publishes a migration or rewrites games.
// node --env-file=.env.local scripts/test-fide-standings.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const migration = new URL('../supabase/migrations/20261028130450_fide_2026_unplayed_standings.sql', import.meta.url);
const special = '66e2e118-ca2f-4b8b-8096-dd677e430a11';
const ordinary = 'fd807e1a-0b12-4f4a-b755-ae9112148d30';
// Frozen hand-calculated expectations, not calculated by the SQL under test.
// seed, points, BH, BH1, SB, progressive, games, wins, draws, losses.
const expected = [
  [1,2,12,10,5,5,3,0,3,0],
  [2,1.5,9,7.5,3,3.5,3,0,3,0],
  [3,2.5,12,10,6.25,6.5,3,0,3,0],
  [4,1.5,11,9.5,3.25,3.5,4,0,3,1],
  [5,1.5,9,7.5,3,6,3,0,3,0],
  [6,3,13,11,7.5,10,4,0,4,0],
  [7,3,13,11.5,7.25,10,4,0,4,0],
  [8,2,10,8,4,5,4,0,4,0],
  [9,3,13,11.5,7.25,10,5,1,4,0],
  [10,2.5,12,10,6,7.5,5,0,5,0],
  [11,3,13,11.5,7.75,10,4,0,4,0],
];
const fields = ['initial_ranking','points','buchholz','buchholz_cut1','sonneborn_berger','progressive','games_played','wins','draws','losses'];
const client = new pg.Client({connectionString:process.env.SUPABASE_DB_URL || process.env.DATABASE_URL});
await client.connect();
const q = async(sql,params=[]) => (await client.query(sql,params)).rows;
const functions = () => q(`select proname, md5(pg_get_functiondef(oid)) as hash, proacl::text as acl,
  pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as result
  from pg_proc where oid in ('public.recalculate_standings(uuid)'::regprocedure,
    'public.sync_player_scores_from_standings(uuid)'::regprocedure) order by proname`);
const snapshot = id => q(`select tp.initial_ranking,s.points,s.buchholz,s.buchholz_cut1,s.sonneborn_berger,
  s.progressive,s.games_played,s.wins,s.draws,s.losses,s.rank,tp.current_score,tp.current_rank,
  tp.buchholz as cached_bh,tp.buchholz_cut1 as cached_bh1,tp.sonneborn_berger as cached_sb,tp.progressive as cached_progressive
  from standings s join tournament_players tp on tp.id=s.tournament_player_id
  where s.tournament_id=$1 order by tp.initial_ranking`,[id]);
const resultsHash = () => q(`select md5(jsonb_agg(to_jsonb(p) order by p.id)::text) as hash
  from pairings p where p.tournament_id in ($1,$2)`,[special,ordinary]);
let checks=0;
function equal(actual,wanted,label){assert.deepEqual(actual,wanted,label);checks++;}
const calc = id => q('select public.recalculate_standings($1)',[id]);
async function scenario(name,action){
  await q('savepoint scenario');
  try{await action();console.log('PASS',name);}
  finally{await q('rollback to savepoint scenario');await q('release savepoint scenario');}
}
const beforeFunctions = await functions();
const beforeOrdinary = await snapshot(ordinary), beforeSpecial = await snapshot(special);
const beforeResults = await resultsHash();
try{
  const fixtures = await q('select id,slug,is_public from tournaments where id in ($1,$2)',[special,ordinary]);
  equal(fixtures.length,2,'audit fixtures must exist');
  assert.ok(fixtures.every(t=>!t.is_public&&t.slug.startsWith('teste-')),'Only private test fixtures are allowed');
  equal(beforeOrdinary.length,20,'ordinary fixture participants');equal(beforeSpecial.length,11,'special fixture participants');
  await q('begin');
  await q("set local lock_timeout='3s'");
  await q("set local statement_timeout='30s'");
  await q(readFileSync(migration,'utf8'));
  const afterFunctions = await functions();
  equal(afterFunctions.map(({args,result,acl})=>({args,result,acl})),beforeFunctions.map(({args,result,acl})=>({args,result,acl})),'function signatures and privileges unchanged');
  await calc(special);
  const corrected = await snapshot(special);
  for(const values of expected){
    const row=corrected.find(r=>r.initial_ranking===values[0]);
    for(let i=0;i<fields.length;i++)equal(Number(row[fields[i]]),values[i],`#${values[0]} ${fields[i]}`);
    equal(Number(row.current_score),Number(row.points),'score cache');
    equal(row.current_rank,row.rank,'rank cache');
    equal(Number(row.cached_bh),Number(row.buchholz),'BH cache');
    equal(Number(row.cached_bh1),Number(row.buchholz_cut1),'BH1 cache');
    equal(Number(row.cached_sb),Number(row.sonneborn_berger),'SB cache');
    equal(Number(row.cached_progressive),Number(row.progressive),'progressive cache');
    equal(row.games_played,row.wins+row.draws+row.losses,'games = W+D+L');
  }
  const order=[...corrected].sort((a,b)=>a.rank-b.rank).map(r=>r.initial_ranking);
  equal(order,[11,9,7,6,3,10,1,8,4,5,2],'WON tie-break: over-the-board wins, not WIN');
  await calc(special);equal(await snapshot(special),corrected,'recalculation idempotent');
  console.log('PASS special fixture: all expected fields and caches; order',order.join(','));

  await calc(ordinary);
  const ordinaryAfter=await snapshot(ordinary);
  for(let i=0;i<ordinaryAfter.length;i++){
    // Legacy sync did not copy progressive. Compare official standings and
    // established cache fields; separately require the new progressive copy.
    const {cached_progressive:oldCopy,...old}=beforeOrdinary[i];
    const {cached_progressive:newCopy,...next}=ordinaryAfter[i];
    equal(next,old,'ordinary games remain unchanged');
    equal(Number(newCopy),Number(next.progressive),'ordinary progressive cache');
  }
  console.log('PASS ordinary fixture: 60 games, standings unchanged');
  const [{id:group}] = await q('select id from pairing_groups where tournament_id=$1',[special]);

  await scenario('pending result is not an absence or dummy opponent',async()=>{
    await q(`update rounds set status='ongoing' where tournament_id=$1 and round_number=5`,[special]);
    await q(`update pairings p set result='*',white_points=null,black_points=null
      from rounds r,tournament_players tp where p.round_id=r.id and r.tournament_id=$1
      and r.round_number=5 and tp.tournament_id=$1 and tp.initial_ranking=11
      and (p.white_tp_id=tp.id or p.black_tp_id=tp.id)`,[special]);
    await calc(special);
    const row=(await snapshot(special)).find(r=>r.initial_ranking===11);
    equal([+row.points,+row.buchholz,+row.buchholz_cut1,+row.sonneborn_berger,row.games_played],[2.5,11.5,9,7,3],'pending is excluded');
  });
  await scenario('draft round awards no points or tiebreak contributions',async()=>{
    await q("update rounds set status='draft' where tournament_id=$1 and round_number=5",[special]);
    await calc(special);
    const row=(await snapshot(special)).find(r=>r.initial_ranking===11);
    equal([+row.points,+row.buchholz,+row.sonneborn_berger,+row.progressive],[2.5,10,6.25,7],'draft ignored');
  });
  await scenario('dummy cap uses group rounds override',async()=>{
    await q('update pairing_groups set rounds_count=6 where id=$1',[group]);await calc(special);
    const row=(await snapshot(special)).find(r=>r.initial_ranking===11);
    equal([+row.buchholz,+row.buchholz_cut1,+row.sonneborn_berger],[13.5,12,8.25],'group cap');
  });
  await scenario('Cut-1 cuts voluntary absence even when a played opponent contributes less',async()=>{
    await q(`update pairings p set result=case when p.white_tp_id=tp.id then '1-0'::game_result else '0-1'::game_result end,
      white_points=case when p.white_tp_id=tp.id then 1 else 0 end,
      black_points=case when p.black_tp_id=tp.id then 1 else 0 end
      from rounds r,tournament_players tp where p.round_id=r.id and r.tournament_id=$1 and r.round_number=3
      and tp.tournament_id=$1 and tp.initial_ranking=1 and (p.white_tp_id=tp.id or p.black_tp_id=tp.id)`,[special]);
    await calc(special);
    const row=(await snapshot(special)).find(r=>r.initial_ranking===1);
    equal([+row.points,+row.buchholz,+row.buchholz_cut1,+row.sonneborn_berger],[2.5,12.5,10,6],'VUR cut');
  });
  await scenario('imported standings remain source-owned',async()=>{
    await q("update tournaments set mode='imported' where id=$1",[special]);
    const before=await snapshot(special);await calc(special);equal(await snapshot(special),before,'import is not recalculated');
  });
  equal(await resultsHash(),beforeResults,'no game result changed by recalculation');
  console.log('VERIFIED',checks,'assertions; all changes will be rolled back');
}finally{
  await q('rollback');
  try{
    equal(await functions(),beforeFunctions,'original functions and ACLs restored');
    equal(await snapshot(ordinary),beforeOrdinary,'ordinary production data restored');
    equal(await snapshot(special),beforeSpecial,'special production data restored');
    equal(await resultsHash(),beforeResults,'original games restored');
    console.log('ROLLBACK VERIFIED: original functions, privileges, standings and results unchanged');
  }finally{await client.end();}
}
