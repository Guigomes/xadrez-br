import { NextResponse, after } from 'next/server';
import { sendAppUserNotification } from '@/lib/push';
import { notifyRoundPublished, notifyTournamentSummary } from '@/lib/import/notify';
import { boardsText, newRoundAssignments, type ArbiterBackup } from '@/lib/lite/arbiter';
import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database.generated';
import { MAX_BACKUP_BYTES, freeSlug, getBearerUser, liteError, tournamentUrl, validateBackup } from '@/lib/lite/server';

/**
 * Envio de um torneio do Gambito Lite: guarda o backup na conta (privado) e, se `isPublic`,
 * publica no site como torneio somente leitura (lite_publish). Despublicar volta para
 * rascunho. Trava de aparelho: só o último aparelho que enviou edita; outro aparelho recebe
 * 409 LOCKED até mandar `takeover: true` (o app pede confirmação antes).
 */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return liteError(401, 'UNAUTHORIZED', 'Entre de novo com sua conta.');

  const text = await request.text();
  if (text.length > MAX_BACKUP_BYTES) return liteError(413, 'TOO_LARGE', 'Torneio grande demais para enviar.');
  let body: { deviceId?: unknown; isPublic?: unknown; takeover?: unknown; backup?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return liteError(400, 'BAD_REQUEST', 'Envio inválido.');
  }
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 64) : '';
  const backup = validateBackup(body.backup);
  if (!deviceId || !backup) return liteError(400, 'BAD_REQUEST', 'Dados do torneio inválidos. Atualize o app.');
  const isPublic = body.isPublic === true;
  const t = backup.tournament;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('lite_tournaments')
    .select('owner_id, device_id, site_tournament_id, prev_rounds:backup->rounds')
    .eq('id', t.id)
    .maybeSingle();
  if (existing && existing.owner_id !== user.id) {
    return liteError(403, 'NOT_OWNER', 'Este torneio pertence a outra conta.');
  }
  if (existing && existing.device_id !== deviceId && body.takeover !== true) {
    return liteError(409, 'LOCKED', 'Este torneio está sendo editado em outro aparelho.');
  }

  const { error: saveError } = await admin.from('lite_tournaments').upsert({
    id: t.id,
    owner_id: user.id,
    device_id: deviceId,
    name: t.name.trim().slice(0, 200),
    is_public: isPublic,
    backup: body.backup as Json,
    app_version: t.updatedAt,
  });
  if (saveError) {
    console.error('[lite/sync] upsert falhou:', saveError.message);
    return liteError(500, 'SAVE_FAILED', 'Não foi possível salvar. Tente de novo.');
  }

  // Rodada nova: cada árbitro recebe no app as mesas dele.
  const prevRounds = Array.isArray((existing as { prev_rounds?: unknown } | null)?.prev_rounds)
    ? ((existing as { prev_rounds: Array<{ number?: number }> }).prev_rounds.map((r) => r.number ?? 0))
    : [];
  const assigned = newRoundAssignments(Math.max(0, ...prevRounds), backup as unknown as ArbiterBackup);
  if (assigned?.byEmail.size) {
    after(async () => {
      const { data: profiles } = await admin.from('user_profiles').select('id, email').in('email', [...assigned.byEmail.keys()]);
      for (const p of profiles ?? []) {
        const boards = assigned.byEmail.get((p.email ?? '').toLowerCase()) ?? [];
        if (!boards.length) continue;
        await sendAppUserNotification(
          p.id,
          { title: t.name, body: `Rodada ${assigned.round}: ${boards.length > 1 ? 'suas mesas' : 'sua mesa'} ${boardsText(boards)}` },
          { type: 'arbiter_round', tournamentId: t.id, name: t.name },
        ).catch((e) => console.error('[lite/sync] aviso ao árbitro:', e));
      }
    });
  }

  // Quem pode abrir o torneio como árbitro (pelo e-mail da conta Google), refeito a cada envio.
  const arbiters = new Map((backup.arbiters ?? []).map((a) => [a.email.trim().toLowerCase(), a.name.trim()]));
  await admin.from('lite_tournament_arbiters').delete().eq('tournament_id', t.id);
  if (arbiters.size) {
    const { error } = await admin
      .from('lite_tournament_arbiters')
      .insert([...arbiters].map(([email, name]) => ({ tournament_id: t.id, email, name })));
    if (error) console.error('[lite/sync] árbitros:', error.message);
  }

  if (isPublic) {
    const slug = await freeSlug(t.name, (body.backup as { tournament: { createdAt: number } }).tournament.createdAt, t.id);
    const { data, error } = await admin.rpc('lite_publish', { p_id: t.id, p_slug: slug });
    if (error) {
      console.error('[lite/sync] lite_publish falhou:', error.message);
      return liteError(500, 'PUBLISH_FAILED', 'Salvo na conta, mas não foi possível publicar no site.');
    }
    // Mesmos avisos dos torneios do site (rodada iniciada, resultado de jogador seguido,
    // rodada concluída) — a rota de eventos deduplica, então reenviar não repete aviso.
    after(async () => {
      const { data: rounds } = await admin.from('rounds').select('id').eq('tournament_id', t.id).in('status', ['ongoing', 'finished']);
      for (const r of rounds ?? []) await notifyRoundPublished(r.id);
      await notifyTournamentSummary(t.id);
    });
    return NextResponse.json({ ok: true, slug: data, url: tournamentUrl(data as string) });
  }
  if (existing?.site_tournament_id) {
    const { error } = await admin.rpc('lite_unpublish', { p_id: t.id });
    if (error) console.error('[lite/sync] lite_unpublish falhou:', error.message);
  }
  return NextResponse.json({ ok: true, slug: null, url: null });
}
