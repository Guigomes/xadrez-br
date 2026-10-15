// Importa uma categoria do info64.org (ex.: Mundial FIDE U7–U17 2026) para o chess-viewer.
//
// Uso (a partir da raiz do repo xadrez-br):
//   # só mostra o que seria importado, sem tocar no banco nem exigir credencial
//   npx tsx scripts/info64/import-info64.ts https://info64.org/fide-world-championship-2026-o7 --dry-run
//
//   # cria (ou reaproveita) o torneio + a linha de tournament_imports e importa
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/info64/import-info64.ts https://info64.org/fide-world-championship-2026-o7
//
// Rodar de novo atualiza (idempotente). Outras categorias entram no MESMO torneio: basta passar a
// URL da próxima (…-g7, …-o9) — o torneio é achado pelo slug.
//
// Opções:
//   --dry-run                  só lê e valida a fonte
//   --tournament-name "<nome>" nome do torneio (padrão: FIDE World U7-U17 Championships 2026)
//   --tournament-slug <slug>   força o slug (padrão: slugify(nome)-<início sem hífen>)
//   --organizer "<nome>"       organizer_name (padrão: FIDE)
//   --created-by-email <email> dono do torneio (padrão: guigomes.ti@gmail.com)
//   --group-name "<nome>"      grupo de emparceiramento (padrão: "U7 Open", "U9 Girls"...)
//   --worker-src <dir>         onde está src/ do xadrez-br-cron (padrão: ../xadrez-br-cron/src ou $CRON_SRC)
//
// A linha de tournament_imports nasce com enabled=false: o worker agendado ainda não conhece o
// info64 (parseBaseUrl só aceita chess-results) e falharia a cada ciclo, avisando o dev. Quando o
// worker ganhar o desvio para `processInfo64Import`, basta ligar enabled.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  type Importers,
  buildPlayersWorkbook,
  categoryGroupName,
  fetchInfo64Html,
  parseInfo64Url,
  parseMeta,
  parsePairings,
  parsePlayers,
  parseStandings,
  processInfo64Import,
} from './info64';

const DEFAULT_NAME = 'FIDE World U7-U17 Championships 2026';
const DEFAULT_EMAIL = 'guigomes.ti@gmail.com';

interface Options {
  url: string;
  dryRun: boolean;
  tournamentName: string;
  tournamentSlug: string | null;
  organizer: string;
  createdByEmail: string;
  groupName: string | null;
  workerSrc: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    url: '',
    dryRun: false,
    tournamentName: DEFAULT_NAME,
    tournamentSlug: null,
    organizer: 'FIDE',
    createdByEmail: DEFAULT_EMAIL,
    groupName: null,
    workerSrc: process.env.CRON_SRC ?? '../xadrez-br-cron/src',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} exige um valor`);
      return v;
    };
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--tournament-name') opts.tournamentName = next();
    else if (a === '--tournament-slug') opts.tournamentSlug = next();
    else if (a === '--organizer') opts.organizer = next();
    else if (a === '--created-by-email') opts.createdByEmail = next();
    else if (a === '--group-name') opts.groupName = next();
    else if (a === '--worker-src') opts.workerSrc = next();
    else if (a.startsWith('--')) throw new Error(`opção desconhecida: ${a}`);
    else if (!opts.url) opts.url = a;
    else throw new Error(`argumento inesperado: ${a}`);
  }
  if (!opts.url) throw new Error('informe a URL da categoria (ex.: https://info64.org/fide-world-championship-2026-o7)');
  return opts;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function loadImporters(workerSrc: string): Promise<Importers> {
  const dir = resolve(process.cwd(), workerSrc);
  const load = async (file: string) => import(pathToFileURL(resolve(dir, file)).href);
  try {
    const [players, pairings, standings] = await Promise.all([
      load('import-players.ts'),
      load('import-pairings.ts'),
      load('import-standings.ts'),
    ]);
    return {
      importPlayers: players.importPlayers,
      importPairings: pairings.importPairings,
      importStandings: standings.importStandings,
    };
  } catch (err) {
    throw new Error(
      `não consegui carregar os importadores do worker em ${dir} (${(err as Error).message}). ` +
        'Use --worker-src <dir do src/ do xadrez-br-cron> ou defina CRON_SRC.',
    );
  }
}

async function findUserId(supabase: SupabaseClient, email: string): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`falha ao listar usuários: ${error.message}`);
    const users = (data?.users ?? []) as { id: string; email?: string }[];
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  throw new Error(`usuário ${email} não encontrado em auth.users`);
}

async function dryRun(opts: Options): Promise<void> {
  const info = parseInfo64Url(opts.url);
  const indexHtml = await fetchInfo64Html(info.baseUrl);
  const meta = parseMeta(indexHtml, info.category);
  const players = parsePlayers(indexHtml);
  console.log(`Categoria ${info.category} → grupo "${opts.groupName ?? categoryGroupName(info.category)}"`);
  console.log(`Torneio: ${meta.tournamentName} · ${meta.city} · ${meta.startDate}..${meta.endDate} · ${meta.timeControl} · árbitro ${meta.chiefArbiter}`);
  console.log(`Jogadores: ${players.length} (com FIDE ID: ${players.filter((p) => p.fideId).length}, títulos: ${players.filter((p) => p.title).length})`);
  // Valida que a conversão gera planilha legível (não toca no banco)
  buildPlayersWorkbook(players, info.category.startsWith('G') ? 'w' : null);

  let published = 0;
  for (let rd = 1; rd <= (meta.roundsCount || 99); rd++) {
    const parsed = parsePairings(await fetchInfo64Html(`${info.baseUrl}/${rd}`));
    if (parsed.pairings.length === 0) break;
    published = rd;
    const played = parsed.pairings.filter((p) => p.result && p.blackName).length;
    const byes = parsed.pairings.filter((p) => !p.blackName).length;
    console.log(`  Rodada ${rd} (${parsed.date ?? '?'}): ${parsed.pairings.length} mesas, ${played} com resultado, ${byes} sem adversário`);
  }
  const standings = parseStandings(await fetchInfo64Html(`${info.baseUrl}/standings`));
  console.log(`Rodadas publicadas: ${published}/${meta.roundsCount} · classificação após a rodada ${standings.afterRound}: ${standings.rows.length} jogadores`);
  const top = standings.rows.slice(0, 3).map((s) => `${s.pos}. ${s.name} (${s.points})`).join(' · ');
  console.log(`Top 3: ${top}`);
  console.log('Dry-run concluído — nada foi gravado.');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.dryRun) return dryRun(opts);

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (ou use --dry-run)');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const importers = await loadImporters(opts.workerSrc);

  const info = parseInfo64Url(opts.url);
  const groupName = opts.groupName ?? categoryGroupName(info.category);

  // 1. Categoria já cadastrada? Então é só re-sincronizar.
  const { data: existingImport, error: impErr } = await supabase
    .from('tournament_imports')
    .select('id, tournament_id, base_url, pairing_group_name')
    .eq('base_url', info.baseUrl)
    .maybeSingle();
  if (impErr) throw new Error(`falha ao consultar tournament_imports: ${impErr.message}`);

  let row = existingImport as { id: string; tournament_id: string; base_url: string; pairing_group_name: string | null } | null;
  if (row) {
    console.log(`Categoria já cadastrada (import ${row.id}) — re-sincronizando.`);
  } else {
    const indexHtml = await fetchInfo64Html(info.baseUrl);
    const meta = parseMeta(indexHtml, info.category);
    const startDate = meta.startDate ?? new Date().toISOString().slice(0, 10);
    const slug = opts.tournamentSlug ?? `${slugify(opts.tournamentName)}-${startDate.replace(/-/g, '')}`;

    // 2. Torneio: reaproveita pelo slug (outras categorias entram no mesmo), senão cria.
    const { data: existingT, error: tErr } = await supabase.from('tournaments').select('id, mode').eq('slug', slug).maybeSingle();
    if (tErr) throw new Error(`falha ao consultar tournaments: ${tErr.message}`);
    let tournamentId: string;
    if (existingT) {
      if (existingT.mode !== 'imported') throw new Error(`o torneio ${slug} existe mas não é mode='imported' (${existingT.mode}) — abortando`);
      tournamentId = existingT.id as string;
      console.log(`Reaproveitando torneio ${slug} (${tournamentId}).`);
    } else {
      const createdBy = await findUserId(supabase, opts.createdByEmail);
      const { data: created, error: cErr } = await supabase
        .from('tournaments')
        .insert({
          slug,
          name: opts.tournamentName,
          city: meta.city,
          organizer_name: opts.organizer,
          chief_arbiter: meta.chiefArbiter,
          time_control: meta.timeControl,
          tournament_type: 'swiss',
          start_date: startDate,
          end_date: meta.endDate,
          rounds_count: meta.roundsCount || null,
          is_public: false,
          mode: 'imported',
          created_by: createdBy,
        })
        .select('id')
        .single();
      if (cErr || !created) throw new Error(`falha ao criar o torneio: ${cErr?.message ?? 'sem retorno'}`);
      tournamentId = created.id as string;
      console.log(`Torneio criado: ${slug} (${tournamentId}) — is_public=false.`);
    }

    const { data: createdImport, error: ciErr } = await supabase
      .from('tournament_imports')
      .insert({ tournament_id: tournamentId, base_url: info.baseUrl, pairing_group_name: groupName, enabled: false })
      .select('id, tournament_id, base_url, pairing_group_name')
      .single();
    if (ciErr || !createdImport) throw new Error(`falha ao criar tournament_imports: ${ciErr?.message ?? 'sem retorno'}`);
    row = createdImport as NonNullable<typeof row>;
    console.log(`Import cadastrado (grupo "${groupName}", enabled=false).`);
  }

  // 3. Importa e registra o resultado no mesmo formato do worker.
  const startedAt = new Date().toISOString();
  try {
    const summary = await processInfo64Import(supabase, row, importers);
    await supabase
      .from('tournament_imports')
      .update({ last_run_at: startedAt, last_status: 'success', last_message: summary.slice(0, 500) })
      .eq('id', row.id);
    console.log(`OK — ${summary}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('tournament_imports')
      .update({ last_run_at: startedAt, last_status: 'error', last_message: message.slice(0, 500) })
      .eq('id', row.id);
    throw err;
  }
}

main().catch((err) => {
  console.error('ERRO:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
