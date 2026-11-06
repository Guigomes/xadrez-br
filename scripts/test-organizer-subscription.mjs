// Isolated real Postgres (WASM) checks. No network, production DB or app dependency.
// Usage: node scripts/test-organizer-subscription.mjs <directory-with-pglite-installed>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { testPlayerHistorySubscription } from './lib/test-player-history-subscription.mjs';
if (!process.argv[2]) throw new Error('Pass an external directory containing @electric-sql/pglite (0.5.14).');
const { PGlite } = createRequire(resolve(process.argv[2], 'package.json'))('@electric-sql/pglite');
const db = new PGlite();
const uid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const owner = uid(1), staff = uid(2), dev = uid(3), event = uid(100), destination = uid(101);
const sql = await readFile(new URL('../supabase/migrations/20261102052706_organizer_subscription_player_limit.sql', import.meta.url), 'utf8');
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const scalar = async (query, params = []) => (await db.query(query, params)).rows[0].value;
const expectBlocked = async (query, params = [], code = 'P0001') => {
  await assert.rejects(db.query(query, params), (error) => error.code === code && (code !== 'P0001' || error.message.includes('ORGANIZER_SUBSCRIPTION_REQUIRED')));
  checks++;
};
const add = (tournament = event) => db.query('insert into tournament_players(tournament_id) values ($1)', [tournament]);
const fill = (count, tournament = event) => db.query('insert into tournament_players(tournament_id) select $1::uuid from generate_series(1,$2::integer)', [tournament, count]);
const resetRoster = () => db.exec('delete from tournament_players; delete from subscriptions;');
const subscribe = (user, status, plan = 'organizer') => db.query(
  'insert into subscriptions(user_id,plan_id,status) select $1,id,$2 from plans where code=$3', [user, status, plan],
);
try {
  // Minimal compatible fixture: exercise the actual migration, not a port of its logic.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create type user_role as enum ('admin','organizer','arbiter','public_user');
    create table plans(id uuid primary key default gen_random_uuid(), code text unique, name text, description text,
      price_cents integer, currency text default 'BRL', billing_interval text, is_public boolean, sort_order integer);
    create table plan_entitlements(plan_id uuid references plans, key text, enabled boolean, limit_int integer, primary key(plan_id,key));
    create table app_settings(key text primary key, value jsonb);
    create table user_profiles(id uuid primary key, role user_role, plan_id uuid references plans);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.auth_user_role() returns user_role language sql stable as
      $$ select role from user_profiles where id=auth.uid() $$;
    create table subscriptions(id uuid primary key default gen_random_uuid(), user_id uuid references user_profiles,
      plan_id uuid references plans, status text, asaas_subscription_id text);
    create table tournaments(id uuid primary key, created_by uuid references user_profiles);
    create table tournament_players(id uuid primary key default gen_random_uuid(), tournament_id uuid references tournaments,
      status text default 'active', pairing_group text, points numeric default 0);
    create table tournament_registrations(tournament_id uuid references tournaments, status text default 'pending');
    insert into plans(code,name) values ('free','Grátis'),('player','Jogador+'),('plus','Plus'),('pro','Pro'),('federation','Federação');
    insert into plan_entitlements select id,'tournament.players',true,case when code in ('free','player') then 30 else null end from plans;
    insert into plan_entitlements select id,'reports.download',true,null from plans where code='pro';
    insert into app_settings values ('billing_enabled','false');
  `);
  await db.query('insert into user_profiles(id,role) values ($1,\'organizer\'),($2,\'arbiter\'),($3,\'admin\')', [owner, staff, dev]);
  await db.query('insert into tournaments values ($1,$3),($2,$3)', [event, destination, owner]);
  await db.exec(sql);
  await db.exec(sql);
  check(await scalar("select price_cents value from plans where code='organizer'") === 1999, 'approved price; migration twice');
  check(await scalar("select value from app_settings where key='billing_enabled'") === false, 'global billing remains disabled');
  check(await scalar("select count(*)::integer value from plan_entitlements e join plans p on p.id=e.plan_id where p.code in ('free','player') and e.key='tournament.players' and e.limit_int=20") === 2, 'free limits');
  check(await scalar("select count(*)::integer value from plan_entitlements e join plans p on p.id=e.plan_id where p.code='organizer' and e.key='tournament.players' and e.limit_int is null") === 1, 'organizer unlimited');
  check(await scalar("select has_function_privilege('anon','private.enforce_organizer_player_limit()','execute') value") === false, 'trigger not publicly callable');
  await fill(19);
  await add();
  await expectBlocked('insert into tournament_players(tournament_id) values ($1)', [event]);
  check(await scalar('select count(*)::integer value from tournament_players') === 20, '19 -> 20 succeeds; 21 blocked, including service callers with null auth');
  await db.exec("update tournament_players set status='withdrawn',pairing_group='sub-12'");
  await expectBlocked('insert into tournament_players(tournament_id,pairing_group) values ($1,\'absolute\')', [event]);
  await db.query('insert into tournament_registrations(tournament_id) select $1::uuid from generate_series(1,50)', [destination]);
  await add(destination);
  check(await scalar('select count(*)::integer value from tournament_players where tournament_id=$1', [destination]) === 1, 'pending registrations do not count');
  await resetRoster();
  await expectBlocked('insert into tournament_players(tournament_id) select $1::uuid from generate_series(1,21)', [event]);
  check(await scalar('select count(*)::integer value from tournament_players') === 0, 'bulk insertion is atomic and capped');
  for (const status of ['pending','overdue','canceled']) {
    await resetRoster(); await subscribe(owner, status); await fill(20);
    await expectBlocked('insert into tournament_players(tournament_id) values ($1)', [event]);
  }
  await resetRoster(); await subscribe(owner, 'active', 'player'); await fill(20);
  await expectBlocked('insert into tournament_players(tournament_id) values ($1)', [event]);
  await resetRoster(); await subscribe(staff, 'active');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
  await fill(20);
  await expectBlocked('insert into tournament_players(tournament_id) values ($1)', [event]);
  await resetRoster(); await subscribe(owner, 'active'); await fill(24);
  check(await scalar('select count(*)::integer value from tournament_players') === 24, 'paid owner allows >20');
  await db.exec("update subscriptions set status='overdue'; update tournament_players set points=1,pairing_group='sub-10'");
  check(await scalar('select count(*)::integer value from tournament_players where points=1') === 24, 'downgrade preserves existing roster and edits');
  await expectBlocked('insert into tournament_players(tournament_id) values ($1)', [event]);
  await fill(20, destination);
  await expectBlocked('update tournament_players set tournament_id=$1 where id=(select id from tournament_players where tournament_id=$2 limit 1)', [destination, event]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [dev]); await add();
  check(await scalar('select count(*)::integer value from tournament_players where tournament_id=$1', [event]) === 25, 'acting Dev exemption');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.query('update tournaments set created_by=$1 where id=$2', [dev, event]); await add();
  check(await scalar('select count(*)::integer value from tournament_players where tournament_id=$1', [event]) === 26, 'owner Dev exemption');
  await db.query('update tournaments set created_by=$1 where id=$2', [owner, event]);
  await db.exec("update app_settings set value='false' where key='organizer_billing_enabled'"); await add();
  check(await scalar('select count(*)::integer value from tournament_players where tournament_id=$1', [event]) === 27, 'rollback switch allows additions without data loss');
  await db.exec("update app_settings set value='true' where key='organizer_billing_enabled'");
  await expectBlocked('insert into tournament_players(tournament_id) values ($1)', [event]);
  await db.exec('delete from subscriptions'); await subscribe(owner, 'pending');
  await expectBlocked("insert into subscriptions(user_id,plan_id,status) select $1,id,'pending' from plans where code='organizer'", [owner], '23505');
  await db.exec("update subscriptions set status='canceled'"); await subscribe(owner, 'pending');
  check(await scalar('select count(*)::integer value from subscriptions') === 2, 'canceled subscription permits new checkout; simultaneous live checkout protected');
  await testPlayerHistorySubscription({ db, uid, check, scalar, subscribe, owner, staff, dev, event });
  console.log(`${checks} isolated PostgreSQL checks passed. Both migrations reapplied. Production untouched.`);
  console.log('Concurrency requires multi-connection PostgreSQL verification; PGlite is single-connection.');
} finally { await db.close(); }
