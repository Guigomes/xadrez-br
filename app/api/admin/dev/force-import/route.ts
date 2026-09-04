import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { processImport } from '@/lib/import/process-tournament';
import { acquireImportLock, releaseImportLock } from '@/lib/import/lock';

export const runtime = 'nodejs';
// Import de torneio com muitas rodadas ainda não fechadas localmente pode
// levar bem mais que o padrão de 10s do Next — o teto real depende do plano
// Vercel (Hobby ignora isso e trava em 60s de qualquer forma).
export const maxDuration = 300;

/**
 * Botão "Dev: forçar sincronização agora" (aba Importações de um torneio
 * importado, visível só pra role='admin') — roda a MESMA lógica do worker
 * cron-import (ver lib/import/process-tournament.ts pro porquê da cópia),
 * mas só pras linhas de tournament_imports DESTE torneio, na hora, em vez
 * de esperar o próximo tick do Cloud Scheduler (1-2 min).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 });
  }

  const { tournamentId } = await request.json().catch(() => ({}));
  if (!tournamentId || typeof tournamentId !== 'string') {
    return NextResponse.json({ error: 'tournamentId inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: rows, error: rowsError } = await admin
    .from('tournament_imports')
    .select('id, tournament_id, base_url, pairing_group_name')
    .eq('tournament_id', tournamentId)
    .eq('enabled', true);
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Nenhuma importação ativa configurada pra este torneio.' }, { status: 404 });
  }

  // Mesma trava do worker agendado (cron_import_lock) — se ele estiver
  // rodando agora, não entra junto (ver lib/import/lock.ts).
  if (!(await acquireImportLock(admin))) {
    return NextResponse.json(
      { error: 'A sincronização agendada está rodando agora — tente de novo em alguns minutos.' },
      { status: 409 },
    );
  }

  try {
    // Sequencial, igual ao worker (index.ts) — torneio multi-grupo roda uma
    // linha de cada vez, não em paralelo, pra não arriscar corrida ao criar
    // pairing_group novo (sort_order calculado por contagem lida antes do
    // insert).
    const results: { id: string; pairingGroupName: string | null; ok: boolean; message: string }[] = [];
    for (const row of rows) {
      const startedAt = new Date().toISOString();
      try {
        const summary = await processImport(admin, row);
        await admin
          .from('tournament_imports')
          .update({ last_run_at: startedAt, last_status: 'success', last_message: summary.slice(0, 500) })
          .eq('id', row.id);
        results.push({ id: row.id, pairingGroupName: row.pairing_group_name, ok: true, message: summary });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await admin
          .from('tournament_imports')
          .update({ last_run_at: startedAt, last_status: 'error', last_message: message.slice(0, 500) })
          .eq('id', row.id);
        results.push({ id: row.id, pairingGroupName: row.pairing_group_name, ok: false, message });
      }
    }
    return NextResponse.json({ ok: true, results });
  } finally {
    await releaseImportLock(admin);
  }
}
