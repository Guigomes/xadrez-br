// Fila de pedidos de relatório de desempenho (report_orders) — ferramenta do operador.
//
// Automatiza a parte mecânica do relatório; o texto (momentos-chave, puzzles,
// plano) continua sendo escrito com a skill chess-game-report.
//
//   node --env-file=.env.local scripts/reports/report-queue.mjs list
//   node --env-file=.env.local scripts/reports/report-queue.mjs prepare <pedido> [--depth 18] [--no-analyze]
//   node --env-file=.env.local scripts/reports/report-queue.mjs deliver <pedido> <arquivo.pdf>
//   node --env-file=.env.local scripts/reports/report-queue.mjs try --player <uuid> (--tournament <uuid> | --history <uuid>) [--no-analyze]
//     (mesma preparação, sem pedido e sem gravar nada no banco — para teste ou relatório feito por fora)
//
// <pedido> aceita o id completo ou o começo dele (8+ caracteres).
// prepare: cria a pasta de trabalho (REPORTS_WORKDIR, padrão C:/workspace-ssd/relatorios),
//   exporta as partidas com lances do banco para partidas.pgn (nomes e rodada normalizados),
//   grava contexto.json (jogador, torneio, todas as partidas, inclusive as sem lances),
//   copia a skill, roda games-from-pgn e a análise do Stockfish, e marca o pedido "em produção".
// deliver: envia o PDF ao bucket privado "reports" e marca o pedido como entregue
//   (recusa pedido cancelado ou cobrado sem pagamento confirmado — mesma regra do site).

import pg from 'pg';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SKILL = process.env.REPORT_SKILL_DIR ?? join(homedir(), '.claude', 'skills', 'chess-game-report');
const WORKDIR = process.env.REPORTS_WORKDIR ?? 'C:/workspace-ssd/relatorios';
const [cmd, ...args] = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };

const RESULT_POINTS = { '1-0': [1, 0], '0-1': [0, 1], '1/2-1/2': [0.5, 0.5], '+-': [1, 0], '-+': [0, 1], '--': [0, 0] };
const slugify = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  if (cmd === 'list') await list();
  else if (cmd === 'prepare') await prepare(args[0]);
  else if (cmd === 'try') await prepareDirect();
  else if (cmd === 'deliver') await deliver(args[0], args[1]);
  else console.log('uso: report-queue.mjs list | prepare <pedido> [--depth 18] [--no-analyze] | deliver <pedido> <arquivo.pdf>');
} finally {
  await db.end();
}

async function findOrder(prefix) {
  if (!prefix || prefix.length < 8) throw new Error('Informe o id do pedido (ao menos 8 caracteres).');
  const { rows } = await db.query(
    `select o.*, p.full_name player_name, p.cbx_id, p.fide_id, p.rating_std, p.rating_rpd, p.rating_blz, p.birth_year, p.club_or_school
       from report_orders o join players p on p.id = o.player_id
      where o.id::text like $1 || '%'`, [prefix]);
  if (rows.length !== 1) throw new Error(rows.length ? 'Mais de um pedido com esse começo de id.' : 'Pedido não encontrado.');
  return rows[0];
}

async function list() {
  const { rows } = await db.query(
    `select o.id, o.status, o.payment_status, o.price_cents, o.tournament_name, o.created_at, p.full_name
       from report_orders o join players p on p.id = o.player_id
      where o.status not in ('delivered', 'canceled') order by o.created_at`);
  if (!rows.length) return console.log('Nenhum pedido aberto.');
  for (const r of rows) {
    const ready = r.price_cents > 0 ? r.payment_status === 'paid' : true;
    console.log(`${r.id.slice(0, 8)}  ${r.status.padEnd(16)} ${ready ? 'liberado ' : 'sem pagto'}  ${r.full_name} — ${r.tournament_name}`);
  }
}

/** Partidas do jogador no torneio do pedido, com o PGN quando houver. */
async function loadGames(order) {
  if (order.tournament_id) {
    const { rows } = await db.query(
      `select r.round_number round, pa.board_number board, pa.result::text result, pa.is_bye,
              (wt.player_id = $2) hero_white,
              wp.full_name white_name, wp.rating_std white_rating, bp.full_name black_name, bp.rating_std black_rating,
              pp.pgn
         from pairings pa join rounds r on r.id = pa.round_id
         left join tournament_players wt on wt.id = pa.white_tp_id left join players wp on wp.id = wt.player_id
         left join tournament_players bt on bt.id = pa.black_tp_id left join players bp on bp.id = bt.player_id
         left join pairing_pgns pp on pp.pairing_id = pa.id
        where pa.tournament_id = $1 and (wt.player_id = $2 or bt.player_id = $2)
        order by r.round_number`, [order.tournament_id, order.player_id]);
    const { rows: [t] } = await db.query(
      `select name, start_date, end_date, city, state, time_control, rounds_count from tournaments where id = $1`, [order.tournament_id]);
    const { rows: [standing] } = await db.query(
      `select current_rank, current_score from tournament_players where tournament_id = $1 and player_id = $2 limit 1`,
      [order.tournament_id, order.player_id]);
    return { games: rows, tournament: { ...t, kind: 'ao vivo' }, standing: standing ?? null };
  }
  const { rows } = await db.query(
    `select g.round, null::int board, g.result::text result, false is_bye, (g.white_player_id = $2) hero_white,
            g.white_name, g.white_rating, g.black_name, g.black_rating, x.pgn
       from history_games g left join history_game_pgns x on x.game_id = g.id
      where g.tournament_id = $1 and (g.white_player_id = $2 or g.black_player_id = $2)
      order by g.round`, [order.history_tournament_id, order.player_id]);
  const { rows: [t] } = await db.query(
    `select name, start_date, end_date, city, state, time_control_kind time_control, null::int rounds_count
       from history_tournaments where id = $1`, [order.history_tournament_id]);
  return { games: rows, tournament: { ...t, kind: 'arquivo histórico (só partidas jogadas)' }, standing: null };
}

/** Reescreve White/Black/Round para nomes canônicos — garante que games-from-pgn ache o jogador. */
function normalizePgn(pgn, { white, black, round }) {
  let out = pgn.replace(/^\uFEFF/, '').trim();
  const set = (tag, value) => {
    const line = `[${tag} "${String(value).replace(/"/g, "'")}"]`;
    const re = new RegExp(`^\\[${tag}\\s+"[^"]*"\\]\\s*$`, 'm');
    out = re.test(out) ? out.replace(re, line) : `${line}\n${out}`;
  };
  set('Round', round);
  set('Black', black);
  set('White', white);
  if (!/^\[Event /m.test(out)) out = `[Event "?"]\n${out}`;
  return out;
}

function run(command, cmdArgs, cwd) {
  // shell só para o npm (npm.cmd no Windows); o node recebe argumentos com espaço (nome do jogador) sem shell.
  const r = spawnSync(command, cmdArgs, { cwd, stdio: 'inherit', shell: command === 'npm' && process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`Falhou: ${command} ${cmdArgs.join(' ')}`);
}

async function prepare(prefix) {
  return prepareOrder(await findOrder(prefix), { updateStatus: true });
}

/** Prepara a pasta sem pedido (teste ou relatório feito por fora): --player <uuid> e --tournament|--history <uuid>. */
async function prepareDirect() {
  const playerId = opt('--player'), tournamentId = opt('--tournament') ?? null, historyId = opt('--history') ?? null;
  if (!playerId || (!tournamentId && !historyId)) throw new Error('uso: try --player <uuid> (--tournament <uuid> | --history <uuid>)');
  const { rows: [p] } = await db.query(
    `select full_name player_name, cbx_id, fide_id, rating_std, rating_rpd, rating_blz, birth_year, club_or_school from players where id = $1`, [playerId]);
  if (!p) throw new Error('Jogador não encontrado.');
  const { rows: [t] } = tournamentId
    ? await db.query('select name from tournaments where id = $1', [tournamentId])
    : await db.query('select name from history_tournaments where id = $1', [historyId]);
  if (!t) throw new Error('Torneio não encontrado.');
  return prepareOrder({
    id: `teste-${Date.now().toString(36)}`, created_at: new Date().toISOString(), price_cents: 0, payment_status: 'none',
    status: 'requested', notes: 'preparação sem pedido', player_id: playerId, tournament_id: tournamentId,
    history_tournament_id: historyId, tournament_name: t.name, ...p,
  }, { updateStatus: false });
}

async function prepareOrder(order, { updateStatus }) {
  if (order.status === 'canceled') throw new Error('Pedido cancelado.');
  if (order.price_cents > 0 && order.payment_status !== 'paid') throw new Error('Pedido cobrado ainda sem pagamento confirmado.');
  if (!existsSync(join(SKILL, 'scripts', 'analyze.mjs'))) throw new Error(`Skill não encontrada em ${SKILL} (defina REPORT_SKILL_DIR).`);

  const { games, tournament, standing } = await loadGames(order);
  const withPgn = games.filter((g) => g.pgn && !g.is_bye);
  if (!withPgn.length) throw new Error('Nenhuma partida com lances neste torneio.');

  const hero = order.player_name;
  const dir = join(WORKDIR, `${order.id.slice(0, 8)}-${slugify(hero)}-${slugify(order.tournament_name)}`);
  mkdirSync(dir, { recursive: true });

  const pgnText = withPgn.map((g) => normalizePgn(g.pgn, {
    white: g.hero_white ? hero : (g.white_name ?? 'Adversário'),
    black: g.hero_white ? (g.black_name ?? 'Adversário') : hero,
    round: g.round,
  })).join('\n\n');
  writeFileSync(join(dir, 'partidas.pgn'), pgnText + '\n');

  let points = 0;
  const table = games.map((g) => {
    const pts = RESULT_POINTS[g.result];
    const mine = pts ? (g.hero_white ? pts[0] : pts[1]) : null;
    if (mine != null) points += mine;
    return {
      round: g.round,
      board: g.board,
      color: g.is_bye ? null : g.hero_white ? 'brancas' : 'pretas',
      opponent: g.is_bye ? 'bye' : g.hero_white ? g.black_name : g.white_name,
      opponentRating: g.is_bye ? null : g.hero_white ? g.black_rating : g.white_rating,
      result: g.result,
      points: mine,
      hasPgn: !!g.pgn && !g.is_bye,
    };
  });
  const age = order.birth_year ? new Date().getFullYear() - order.birth_year : null;
  writeFileSync(join(dir, 'contexto.json'), JSON.stringify({
    pedido: { id: order.id, criadoEm: order.created_at, preco: order.price_cents, observacoes: order.notes },
    jogador: {
      nome: hero, cbx: order.cbx_id, fide: order.fide_id, idade: age, anoNascimento: order.birth_year,
      rating: { std: order.rating_std, rpd: order.rating_rpd, blz: order.rating_blz }, clube: order.club_or_school,
    },
    torneio: { ...tournament, colocacao: standing?.current_rank ?? null, pontosOficiais: standing?.current_score ?? null },
    pontosNasPartidasRegistradas: points,
    partidas: table,
    atencao: [
      'Colocação de categoria e premiação NÃO estão aqui: confirme antes de escrever (regra da skill).',
      age == null ? 'Idade desconhecida: confirme com quem pediu para escolher o tom da página do jogador.' : null,
    ].filter(Boolean),
  }, null, 1));

  cpSync(join(SKILL, 'scripts'), dir, { recursive: true });
  cpSync(join(SKILL, 'assets'), dir, { recursive: true });
  if (!existsSync(join(dir, 'node_modules', 'chess.js'))) run('npm', ['install', '--silent'], dir);
  run('node', ['games-from-pgn.mjs', hero, 'games.json', 'partidas.pgn'], dir);

  if (updateStatus) {
    await db.query(
      `update report_orders set status = 'in_progress' where id = $1 and status in ('requested', 'paid')`, [order.id]);
  }

  writeFileSync(join(dir, 'LEIA-ME.txt'), [
    `Pedido ${order.id} — ${hero} — ${order.tournament_name}`,
    `Partidas: ${games.length} (com lances: ${withPgn.length}). Contexto em contexto.json.`,
    '',
    'Próximos passos (skill chess-game-report, a partir do passo 4):',
    '  4. momentos-chave -> keys.json; node pv.mjs games.json keys.json pv.json 20',
    '  5. puzzles: puzzles-hero.mjs / puzzles-find.mjs -> picks.json; node puzzles-verify2.mjs picks.json puzzles.json',
    '  6. escrever cfg-<slug>.mjs a partir de cfg-EXEMPLO.mjs e contexto.json',
    '  7. node build-report.mjs <slug>',
    '  8. node make-pdf.mjs relatorio-<slug>.html Relatorio.pdf  (conferir o PDF visualmente)',
    `  9. node --env-file=.env.local scripts/reports/report-queue.mjs deliver ${order.id.slice(0, 8)} <pasta>/Relatorio.pdf`,
  ].join('\n') + '\n');

  if (!flag('--no-analyze')) {
    console.log(`Analisando ${withPgn.length} partida(s) com Stockfish (profundidade ${opt('--depth', '18')})…`);
    run('node', ['analyze.mjs', opt('--depth', '18'), 'games.json'], dir);
  }
  console.log(`Pronto: ${dir}\nVeja LEIA-ME.txt para os próximos passos.`);
}

async function deliver(prefix, file) {
  const order = await findOrder(prefix);
  if (!file || !existsSync(file)) throw new Error('Informe o caminho do PDF.');
  if (order.status === 'canceled') throw new Error('Pedido cancelado.');
  if (order.price_cents > 0 && order.payment_status !== 'paid') throw new Error('Pedido cobrado ainda sem pagamento confirmado.');
  const body = readFileSync(file);
  if (body.subarray(0, 4).toString() !== '%PDF') throw new Error('O arquivo não parece um PDF.');

  const path = `${order.id}.pdf`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/reports/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body,
  });
  if (!res.ok) throw new Error(`Upload falhou: ${res.status} ${await res.text()}`);
  await db.query(
    `update report_orders set status = 'delivered', delivery_path = $2, delivered_at = now() where id = $1`, [order.id, path]);
  console.log(`Entregue: ${order.player_name} — ${order.tournament_name} (${(body.length / 1024).toFixed(0)} KB).`);
}
