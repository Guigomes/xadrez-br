import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseBaseUrl,
  buildArtUrl,
  fetchExcelDirect,
  fetchHtml,
  extractMaxRound,
  extractRoundCountFromHeading,
} from './chess-results';
import { importPlayers } from './import-players';
import { importPairings } from './import-pairings';
import { importStandings } from './import-standings';
import { notifyRoundPublished } from './notify';
import {
  isInfo64Url,
  parseInfo64Url,
  info64Pages,
  isGirlsSection,
  playersSheet,
  pairingsSheet,
  standingsSheet,
  totalRoundsFromMenu,
} from './info64';

/**
 * DUPLICAÇÃO DELIBERADA — leia antes de mexer em qualquer arquivo deste
 * diretório (lib/import/).
 *
 * Este diretório é uma cópia de ../../cron-import/src/{chess-results,
 * import-players,import-pairings,import-standings,process-tournament,
 * notify}.ts — a mesma lógica que o worker cron-import (Cloud Run Job
 * "xadrez-br-cron") roda a cada 1-2 min pra TODOS os torneios importados.
 *
 * Por que duplicar em vez de reaproveitar: cron-import é um repositório
 * Node standalone (../cron-import), não um pacote publicado — chess-viewer
 * não tem como importar o código dele em runtime. Chamar o worker de
 * verdade sob demanda exigiria disparar o Cloud Run Job via API (credencial
 * de service account com IAM `run.jobs.run`, dependência nova) e ainda
 * assim rodaria pra TODOS os torneios de uma vez (o worker não aceita
 * filtro por torneio) — decisão consciente do usuário: preferiu esta cópia,
 * mais simples de operar (sem IAM, mira só o torneio clicado, resultado na
 * hora em vez de "espera alguns minutos"), aceitando o custo de manter os
 * dois em sincronia manualmente.
 *
 * Único usado por este import sob demanda: app/api/admin/dev/force-import.
 * Se o worker mudar essa lógica (novo formato de planilha do chess-results,
 * fix de bug, etc.), replicar aqui também — ou os dois caminhos divergem
 * silenciosamente. Ao investigar um bug de import, sempre checar as DUAS
 * cópias antes de reportar corrigido.
 */

interface ImportRow {
  id: string;
  tournament_id: string;
  base_url: string;
  pairing_group_name: string | null;
}

async function resolvePairingGroupId(
  supabase: SupabaseClient,
  tournamentId: string,
  groupName: string | null,
): Promise<string | null> {
  if (!groupName) return null;
  const trimmed = groupName.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from('pairing_groups')
    .select('id')
    .eq('tournament_id', tournamentId)
    .ilike('name', trimmed)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: existingGroups } = await supabase
    .from('pairing_groups')
    .select('id')
    .eq('tournament_id', tournamentId);
  const { data: created } = await supabase
    .from('pairing_groups')
    .insert({
      tournament_id: tournamentId,
      name: trimmed,
      sort_order: existingGroups?.length ?? 0,
    })
    .select('id')
    .single();
  return (created?.id as string) ?? null;
}

/**
 * Torneio publicado no info64.org (ver info64.ts). Mesmo fluxo do chess-results —
 * jogadores, rodadas, classificação, avisos — com as páginas do info64 convertidas
 * para o layout de planilha que os importadores já leem. PGN ainda não: o info64
 * só expõe as partidas por busca, sem um arquivo por rodada.
 */
async function processInfo64Import(
  supabase: SupabaseClient,
  row: ImportRow,
  pairingGroupId: string | null,
): Promise<string> {
  const src = parseInfo64Url(row.base_url);
  const sectionHtml = await info64Pages.section(src);
  const playersResult = await importPlayers(
    supabase,
    row.tournament_id,
    playersSheet(sectionHtml, { girlsSection: isGirlsSection(src) }),
    pairingGroupId,
  );

  // Mesma regra de revisão do chess-results: rodadas encerradas só são relidas se
  // estiverem entre as 2 últimas, ou uma vez por hora.
  let roundsQuery = supabase.from('rounds').select('round_number, status').eq('tournament_id', row.tournament_id);
  roundsQuery = pairingGroupId ? roundsQuery.eq('pairing_group_id', pairingGroupId) : roundsQuery.is('pairing_group_id', null);
  const { data: knownRounds } = await roundsQuery;
  const finishedRounds = new Set((knownRounds ?? []).filter((r) => r.status === 'finished').map((r) => r.round_number as number));
  const knownMax = Math.max(0, ...(knownRounds ?? []).map((r) => r.round_number as number));
  const hourlyDeepCheck = new Date().getUTCMinutes() < 3;

  const totalRounds = totalRoundsFromMenu(sectionHtml, src);
  let maxRound = 0;
  let completedRound = 0;
  let totalPairings = 0;
  let totalPairingsUnmatched = 0;
  let skippedFinishedRounds = 0;
  const roundsToNotify = new Set<string>();
  for (let rd = 1; rd <= totalRounds; rd++) {
    const alreadyFinished = finishedRounds.has(rd);
    if (alreadyFinished && rd < knownMax - 1 && !hourlyDeepCheck) {
      skippedFinishedRounds++;
      maxRound = rd;
      completedRound = rd;
      continue;
    }
    const page = pairingsSheet(await info64Pages.round(src, rd), rd);
    if (!page) break; // rodada ainda não pareada: as seguintes também não estão
    maxRound = rd;
    if (page.open === 0) completedRound = rd;
    try {
      const r = await importPairings(supabase, row.tournament_id, page.sheet, pairingGroupId);
      totalPairings += r.imported;
      totalPairingsUnmatched += r.unmatched;
      if (r.roundId && (!alreadyFinished || r.published)) roundsToNotify.add(r.roundId);
    } catch (err) {
      console.warn(`[${row.id}] info64 rodada ${rd} falhou: ${(err as Error).message}`);
    }
  }

  const { error: roundsCountError } = await supabase
    .from('tournament_imports')
    .update({ discovered_rounds_count: maxRound })
    .eq('id', row.id);
  if (roundsCountError) throw new Error(roundsCountError.message);

  const standingsResult = await importStandings(
    supabase,
    row.tournament_id,
    standingsSheet(await info64Pages.standings(src), completedRound),
    pairingGroupId,
  );

  for (const roundId of roundsToNotify) {
    await notifyRoundPublished(roundId);
  }

  const perdidos = playersResult.collided + playersResult.failed;
  return [
    `info64 · jogadores: ${playersResult.added}+${playersResult.reused} (criados ${playersResult.created}${playersResult.removed > 0 ? `, removidos ${playersResult.removed}` : ''}${perdidos > 0 ? `, NÃO IMPORTADOS ${perdidos}` : ''})`,
    `rodadas 1..${maxRound} de ${totalRounds}: ${totalPairings} pareamentos${totalPairingsUnmatched > 0 ? ` (${totalPairingsUnmatched} não identificados)` : ''}${skippedFinishedRounds > 0 ? ` · ${skippedFinishedRounds} já encerradas, puladas` : ''}`,
    `classificação: ${standingsResult.matched} jogadores`,
  ].join(' · ');
}

export async function processImport(
  supabase: SupabaseClient,
  row: ImportRow,
): Promise<string> {
  // Torneios nativos são gerenciados pelo próprio chess-viewer — o import
  // jamais deve tocá-los (sobrescreveria pareamentos gerados pela engine).
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('mode')
    .eq('id', row.tournament_id)
    .single();
  if (tournament?.mode === 'native') {
    throw new Error('torneio nativo — importação bloqueada (desabilite esta linha de import)');
  }

  const pairingGroupId = await resolvePairingGroupId(
    supabase,
    row.tournament_id,
    row.pairing_group_name,
  );
  if (isInfo64Url(row.base_url)) return processInfo64Import(supabase, row, pairingGroupId);

  const info = parseBaseUrl(row.base_url);

  // 1. Players (art=0 com SNode preservado para filtrar o grupo correto)
  const playersUrl = buildArtUrl(info, 0);
  const playersBuf = await fetchExcelDirect(playersUrl);
  const playersResult = await importPlayers(
    supabase,
    row.tournament_id,
    playersBuf,
    pairingGroupId,
  );

  // 2. Discover round count from standings (art=1) AND pairings index (art=2).
  const standingsPageUrl = buildArtUrl(info, 1);
  const pairingsIndexUrl = buildArtUrl(info, 2);
  const [standingsHtml, pairingsIndexHtml] = await Promise.all([
    fetchHtml(standingsPageUrl),
    fetchHtml(pairingsIndexUrl),
  ]);
  let maxRound = Math.max(
    extractMaxRound(standingsHtml),
    extractMaxRound(pairingsIndexHtml),
  );

  // Fallback pro torneio com mais de 2 semanas (ver chess-results.ts).
  if (maxRound === 0) {
    maxRound = Math.max(
      extractRoundCountFromHeading(standingsHtml),
      extractRoundCountFromHeading(pairingsIndexHtml),
    );
  }

  // NULL no banco significa "fonte ainda não inspecionada"; zero significa
  // uma categoria real sem rodadas. O processador de push usa esta diferença
  // para saber quais categorias devem participar do resumo global.
  const { error: roundsCountError } = await supabase
    .from('tournament_imports')
    .update({ discovered_rounds_count: maxRound })
    .eq('id', row.id);
  if (roundsCountError) throw new Error(roundsCountError.message);

  // 3. Pairings for each round (art=2) — pula rodada já 'finished' localmente,
  // ela quase nunca muda no chess-results (relê as 2 últimas sempre e as demais 1x por hora).
  let finishedRoundsQuery = supabase
    .from('rounds')
    .select('round_number')
    .eq('tournament_id', row.tournament_id)
    .eq('status', 'finished');
  finishedRoundsQuery = pairingGroupId
    ? finishedRoundsQuery.eq('pairing_group_id', pairingGroupId)
    : finishedRoundsQuery.is('pairing_group_id', null);
  const { data: finishedRoundRows } = await finishedRoundsQuery;
  const finishedRounds = new Set((finishedRoundRows ?? []).map((r) => r.round_number as number));

  let totalPairings = 0;
  let totalPairingsUnmatched = 0;
  let skippedFinishedRounds = 0;
  const roundsToNotify = new Set<string>();
  for (let rd = 1; rd <= maxRound; rd++) {
    // A última rodada divulgada é revista mesmo estando 'finished': o árbitro pode
    // refazer o emparceiramento (às vezes mais de uma vez) e antes a rodada nunca
    // mais era relida. importPairings só regrava se o conteúdo mudou e reabre a
    // rodada quando voltam mesas sem resultado. As anteriores seguem a regra de revisão abaixo.
    const alreadyFinished = finishedRounds.has(rd);
    // O árbitro também corrige RESULTADO de rodada já encerrada (ex.: 1-0 virou 0-1 na R3 e
    // o banco ficou com a mesa invertida, a pontuação certa e vitórias/derrotas erradas).
    // Por isso as 2 últimas rodadas são revistas em toda execução, e todas as encerradas uma
    // vez por hora (nos primeiros minutos de cada hora UTC). A revisão é barata: importPairings
    // só regrava a mesa que mudou.
    const recentRound = rd >= maxRound - 1;
    const hourlyDeepCheck = new Date().getUTCMinutes() < 3;
    if (alreadyFinished && !recentRound && !hourlyDeepCheck) {
      skippedFinishedRounds++;
      continue;
    }
    try {
      const pairingsUrl = buildArtUrl(info, 2, rd);
      const buf = await fetchExcelDirect(pairingsUrl);
      const r = await importPairings(supabase, row.tournament_id, buf, pairingGroupId);
      totalPairings += r.imported;
      totalPairingsUnmatched += r.unmatched;
      // A rota interna deduplica quatro eventos independentes. Ela precisa ser
      // chamada em toda sincronização da rodada para perceber resultados que
      // chegam enquanto o status continua 'ongoing'.
      // Rodada encerrada que só foi revista não notifica a cada execução — só
      // quando mudou de estado (ex.: foi reemparceirada e reabriu).
      if (r.roundId && (!alreadyFinished || r.published)) roundsToNotify.add(r.roundId);
    } catch (err) {
      // Rodada futura ainda não publicada falha o parse — pula e segue.
      console.warn(`[${row.id}] rodada ${rd} falhou: ${(err as Error).message}`);
    }
  }

  // 4. Standings (final ranking - art=1). chess-results é fonte autoritativa
  // de pontos/rank/tiebreaks — sem recálculo local.
  const standingsBuf = await fetchExcelDirect(standingsPageUrl);
  const standingsResult = await importStandings(supabase, row.tournament_id, standingsBuf, pairingGroupId);

  // 5. Processa os eventos de push só depois de gravar pairings E standings,
  // para a rota interna ler dados consistentes. As chaves persistidas no app
  // impedem reenvio nas sincronizações seguintes.
  for (const roundId of roundsToNotify) {
    await notifyRoundPublished(roundId);
  }

  const perdidos = playersResult.collided + playersResult.failed;

  return [
    `jogadores: ${playersResult.added}+${playersResult.reused} (criados ${playersResult.created}${playersResult.relinked > 0 ? `, relincados ${playersResult.relinked}` : ''}${playersResult.removed > 0 ? `, removidos ${playersResult.removed}` : ''}${playersResult.notRemoved > 0 ? `, NÃO REMOVIDOS ${playersResult.notRemoved}` : ''}${playersResult.homonyms > 0 ? `, homônimos ${playersResult.homonyms}` : ''}${perdidos > 0 ? `, NÃO IMPORTADOS ${perdidos}` : ''})`,
    `rodadas 1..${maxRound}: ${totalPairings} pareamentos${totalPairingsUnmatched > 0 ? ` (${totalPairingsUnmatched} não identificados)` : ''}${skippedFinishedRounds > 0 ? ` · ${skippedFinishedRounds} já encerradas, puladas` : ''}`,
    `classificação: ${standingsResult.matched} jogadores`,
  ].join(' · ');
}
