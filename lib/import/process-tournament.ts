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

  const info = parseBaseUrl(row.base_url);
  const pairingGroupId = await resolvePairingGroupId(
    supabase,
    row.tournament_id,
    row.pairing_group_name,
  );

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

  // 3. Pairings for each round (art=2) — pula rodada já 'finished' localmente,
  // ela não muda mais no chess-results.
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
  const roundsToNotify: string[] = [];
  for (let rd = 1; rd <= maxRound; rd++) {
    if (finishedRounds.has(rd)) {
      skippedFinishedRounds++;
      continue;
    }
    try {
      const pairingsUrl = buildArtUrl(info, 2, rd);
      const buf = await fetchExcelDirect(pairingsUrl);
      const r = await importPairings(supabase, row.tournament_id, buf, pairingGroupId);
      totalPairings += r.imported;
      totalPairingsUnmatched += r.unmatched;
      if (r.published && r.roundId) roundsToNotify.push(r.roundId);
    } catch (err) {
      // Rodada futura ainda não publicada falha o parse — pula e segue.
      console.warn(`[${row.id}] rodada ${rd} falhou: ${(err as Error).message}`);
    }
  }

  // 4. Standings (final ranking - art=1). chess-results é fonte autoritativa
  // de pontos/rank/tiebreaks — sem recálculo local.
  const standingsBuf = await fetchExcelDirect(standingsPageUrl);
  const standingsResult = await importStandings(supabase, row.tournament_id, standingsBuf, pairingGroupId);

  // 5. Push das rodadas recém-publicadas — só depois de gravar pairings E
  // standings, pra rota interna ler dado já consistente.
  for (const roundId of roundsToNotify) {
    await notifyRoundPublished(roundId);
  }

  const perdidos = playersResult.collided + playersResult.failed;

  return [
    `jogadores: ${playersResult.added}+${playersResult.reused} (criados ${playersResult.created}${playersResult.removed > 0 ? `, removidos ${playersResult.removed}` : ''}${playersResult.homonyms > 0 ? `, homônimos ${playersResult.homonyms}` : ''}${perdidos > 0 ? `, NÃO IMPORTADOS ${perdidos}` : ''})`,
    `rodadas 1..${maxRound}: ${totalPairings} pareamentos${totalPairingsUnmatched > 0 ? ` (${totalPairingsUnmatched} não identificados)` : ''}${skippedFinishedRounds > 0 ? ` · ${skippedFinishedRounds} já encerradas, puladas` : ''}`,
    `classificação: ${standingsResult.matched} jogadores`,
  ].join(' · ');
}
