import { NextResponse } from 'next/server';
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
    .select('owner_id, device_id, site_tournament_id')
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
    return NextResponse.json({ ok: true, slug: data, url: tournamentUrl(data as string) });
  }
  if (existing?.site_tournament_id) {
    const { error } = await admin.rpc('lite_unpublish', { p_id: t.id });
    if (error) console.error('[lite/sync] lite_unpublish falhou:', error.message);
  }
  return NextResponse.json({ ok: true, slug: null, url: null });
}
