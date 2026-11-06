import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Extends the isolated fixture used by test-organizer-subscription.mjs.
export async function testPlayerHistorySubscription({ db, uid, check, scalar, subscribe, owner, staff, dev, event }) {
  await db.exec(`
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
    create type time_control_kind as enum ('bullet','blitz','rapid','classical','other');
    create type game_result as enum ('*','1-0','0-1','1/2-1/2','forfeit_white','forfeit_black','double_forfeit','bye');
    create table players(id uuid primary key,full_name text,title text,cbx_id text,rating_std smallint,rating_rpd smallint,rating_blz smallint);
    alter table tournaments add column slug text,add column name text,add column start_date date,
      add column time_control_kind time_control_kind default 'rapid',add column homologated boolean,
      add column status text default 'finished';
    alter table tournament_players add column player_id uuid references players;
    create table pairing_groups(id uuid primary key,name text);
    create table rounds(id uuid primary key,pairing_group_id uuid,round_number smallint,status text);
    create table pairings(id uuid primary key,tournament_id uuid,round_id uuid,white_tp_id uuid,black_tp_id uuid,
      result game_result,white_points numeric,black_points numeric);
    create table pairing_pgns(pairing_id uuid primary key,pgn text);
    create table history_tournaments(id uuid primary key,slug text,name text,start_date date,time_control_kind time_control_kind,homologated boolean);
    create table history_games(id uuid primary key,tournament_id uuid,group_name text,round smallint,white_player_id uuid,black_player_id uuid,
      white_name text,black_name text,white_rating smallint,black_rating smallint,result game_result);
    create table history_game_pgns(game_id uuid primary key,pgn text);
  `);
  const player = uid(400), opponent = uid(401), white = uid(402), black = uid(403), round = uid(404), pairing = uid(405), archived = uid(406), game = uid(407);
  await db.query("insert into players(id,full_name,rating_std,rating_rpd,rating_blz) values ($1,'Jogador',1600,1700,1800),($2,'Adversário',1500,1550,1590)", [player, opponent]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [dev]);
  await db.query('insert into tournament_players(id,tournament_id,player_id) values ($1,$3,$4),($2,$3,$5)', [white, black, event, player, opponent]);
  await db.query("update tournaments set slug='live',name='Torneio ao vivo',start_date='2026-10-31' where id=$1", [event]);
  await db.query("insert into rounds values($1,null,1,'finished')", [round]);
  await db.query("insert into pairings values ($1,$2,$3,$4,$5,'1-0',1,0)", [pairing, event, round, white, black]);
  await db.query("insert into pairing_pgns values ($1,'1. e4 e5 1-0')", [pairing]);
  await db.query("insert into history_tournaments values($1,'arquivo','Torneio arquivado','2025-01-01','classical',true)", [archived]);
  await db.query("insert into history_games values($1,$2,'Absoluto',2,$3,$4,'Jogador','Adversário',1400,1450,'1/2-1/2')", [game, archived, player, opponent]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const original = await readFile(new URL('../../supabase/migrations/20261022150000_player_stats.sql', import.meta.url), 'utf8');
  await db.exec(original.slice(original.indexOf('drop function if exists public.get_player_history'), original.indexOf('insert into plans')));
  const before = (await db.query('select * from get_player_history($1)', [player])).rows;
  check(before.length === 2 && before.some((row) => row.source === 'live') && before.some((row) => row.source === 'history'), 'baseline contains both history sources');
  const migration = await readFile(new URL('../../supabase/migrations/20261102130414_player_history_subscription.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  check(await scalar("select price_cents value from plans where code='player'") === 499, 'Jogador+ BRL 4.99 after two applications');
  check(await scalar("select is_public value from plans where code='player'") === true, 'Jogador+ available for checkout');
  check(await scalar("select price_cents value from plans where code='organizer'") === 1999, 'organizer price preserved');
  check(await scalar("select value from app_settings where key='billing_enabled'") === false, 'other paywalls stay off');
  check(await scalar("select has_function_privilege('authenticated','private.can_view_full_player_history()','execute') value") === false, 'private helper not directly executable');
  check(await scalar("select has_function_privilege('anon','public.get_player_history(uuid)','execute') value") === false, 'anonymous cannot invoke full history RPC');
  const blocked = async (marker = 'PLAYER_HISTORY_SUBSCRIPTION_REQUIRED') => {
    await assert.rejects(db.query('select * from get_player_history($1)', [player]), (error) => error.code === '42501' && error.message.includes(marker));
    check(true, marker);
  };
  await db.exec('delete from subscriptions');
  await blocked();
  await db.query("update user_profiles set plan_id=(select id from plans where code='player') where id=$1", [owner]);
  await blocked(); // profile.plan_id alone must never grant access
  for (const status of ['pending','overdue','canceled']) {
    await db.exec('delete from subscriptions'); await subscribe(owner, status, 'player'); await blocked();
  }
  await db.exec('delete from subscriptions'); await subscribe(staff, 'active', 'player'); await blocked();
  await db.exec('delete from subscriptions'); await subscribe(owner, 'active', 'free'); await blocked();
  await db.exec('delete from subscriptions'); await subscribe(owner, 'active', 'player');
  assert.deepEqual((await db.query('select * from get_player_history($1)', [player])).rows, before);
  check(true, 'paid history preserves every original row/column/value from both sources');
  await assert.rejects(db.query('insert into tournament_players(tournament_id) values($1)', [event]), /ORGANIZER_SUBSCRIPTION_REQUIRED/);
  check(true, 'Jogador+ does not grant organizer capacity');
  await db.query("select set_config('request.jwt.claims','{\"is_anonymous\":true}',false)");
  await blocked('AUTH_REQUIRED');
  await db.query("select set_config('request.jwt.claims','{}',false)");
  await db.query("select set_config('request.jwt.claim.sub','',false)"); await blocked('AUTH_REQUIRED');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(999)]); await blocked(); // missing profile must fail closed
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [dev]);
  check((await db.query('select * from get_player_history($1)', [player])).rows.length === 2, 'Dev exemption');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('delete from subscriptions'); await subscribe(owner, 'active', 'organizer');
  check((await db.query('select * from get_player_history($1)', [player])).rows.length === 2, 'organizer includes full history');
  await db.exec("update subscriptions set status='overdue'"); await blocked();
  await db.exec("update app_settings set value='false' where key='player_history_billing_enabled'");
  assert.deepEqual((await db.query('select * from get_player_history($1)', [player])).rows, before);
  check(true, 'rollback restores registered access without deleting history');
  await db.exec(migration);
  check(await scalar("select value from app_settings where key='player_history_billing_enabled'") === false, 'reapplying does not re-enable a disabled paywall');
  await db.exec("update plans set price_cents=599 where code='player'"); await db.exec(migration);
  check(await scalar("select price_cents value from plans where code='player'") === 599, 'reapplying preserves an operational price change');
}
