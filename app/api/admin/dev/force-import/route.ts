import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guards';
import { createAdminClient } from '@/lib/supabase/server';
import {
  acquireLock,
  notifyTournamentSummary,
  refreshLock,
  releaseLock,
  runImportRow,
  type ImportRunRow,
} from 'chess-viewer-cron-import/lib';

// Torneio com muitos grupos leva perto de 1 a 2 minutos (cada grupo baixa
// jogadores, rodadas e classificação do chess-results).
export const maxDuration = 300;

const CONCURRENCY = 3;
const LOCK_WAIT_MS = 90_000;
const LOCK_POLL_MS = 5_000;

type RobotClient = Parameters<typeof runImportRow>[0];

/**
 * Botão "Dev: sincronizar agora" (aba Importações de um torneio importado,
 * visível só pra role='admin'). Importa NA HORA, buscando direto no
 * chess-results, as linhas de tournament_imports ligadas do torneio (ou todas,
 * se nenhuma estiver ligada: importação avulsa de torneio já encerrado).
 *
 * O código do importador é o do robô (repo cron-import, dependência
 * `chess-viewer-cron-import` presa num commit): não existe cópia aqui. Uma cópia
 * antiga (lib/import/) ficou para trás e foi removida em 2026-10-22. Para
 * atualizar o importador do site, suba o commit da dependência no package.json.
 *
 * Usa a mesma trava do robô (cron_import_lock): se ele estiver rodando, espera
 * até 90 s; enquanto o site importa, a execução agendada do robô pula.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { tournamentId } = await request.json().catch(() => ({}));
  if (!tournamentId || typeof tournamentId !== 'string') {
    return NextResponse.json({ error: 'tournamentId inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: all, error } = await admin
    .from('tournament_imports')
    .select('id, tournament_id, base_url, pairing_group_name, import_source_categories, enabled, last_status, last_message')
    .eq('tournament_id', tournamentId)
    .order('pairing_group_name');
  if (error) return NextResponse.json({ error: 'Falha ao ler as importações.' }, { status: 500 });
  if (!all?.length) {
    return NextResponse.json({ error: 'Nenhuma importação configurada pra este torneio.' }, { status: 404 });
  }
  const enabled = all.filter((row) => row.enabled);
  const rows: ImportRunRow[] = enabled.length ? enabled : all;

  const robot = admin as unknown as RobotClient;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (!(await acquireLock(robot))) {
    if (Date.now() > deadline) {
      return NextResponse.json(
        { error: 'O robô está sincronizando agora. Tente de novo em 1 minuto.' },
        { status: 409 },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  }

  // Os avisos de rodada (push) o importador manda por HTTP para o próprio site;
  // na Vercel essa variável não existe, então aponta para quem atendeu o pedido.
  if (!process.env.CHESS_VIEWER_URL) process.env.CHESS_VIEWER_URL = new URL(request.url).origin;

  const results: { group: string | null; ok: boolean; message: string }[] = [];
  try {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const row = rows[next++];
        const result = await runImportRow(robot, row);
        results.push({
          group: row.pairing_group_name,
          ok: result.ok,
          message: result.ok ? result.summary : result.error,
        });
        await refreshLock(robot);
      }
    }));
    await notifyTournamentSummary(tournamentId);
  } finally {
    await releaseLock(robot);
  }

  results.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '', 'pt-BR', { numeric: true }));
  return NextResponse.json({
    ok: true,
    total: results.length,
    failed: results.filter((r) => !r.ok).length,
    skippedDisabled: all.length - rows.length,
    results,
  });
}
