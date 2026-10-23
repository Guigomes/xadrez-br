import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { liteError } from '@/lib/lite/server';
import { MAX_PENDING, parseRegistration, sameRegistration } from '@/lib/lite/registration';
import { sendAppUserNotification } from '@/lib/push';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Formulário público de inscrição num torneio do app (link /inscricao/<id>). Sem conta: grava a
 * inscrição pendente e avisa o celular do organizador, que aceita ou recusa.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // Campo escondido: robô preenche, pessoa não.
  if (body?.website) return NextResponse.json({ ok: true });
  const tournamentId = typeof body?.tournamentId === 'string' ? body.tournamentId : '';
  if (!UUID.test(tournamentId)) return liteError(404, 'NOT_FOUND', 'Torneio não encontrado.');

  const parsed = parseRegistration(body);
  if ('error' in parsed) return liteError(400, 'INVALID', parsed.error);

  const admin = createAdminClient();
  const { data: t } = await admin
    .from('lite_tournaments')
    .select('id, name, owner_id, registration_open')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!t) return liteError(404, 'NOT_FOUND', 'Torneio não encontrado.');
  if (!t.registration_open) return liteError(409, 'CLOSED', 'As inscrições deste torneio estão fechadas.');

  const { data: pending } = await admin
    .from('lite_registrations')
    .select('name, birth_year, status')
    .eq('tournament_id', tournamentId)
    .neq('status', 'rejected');
  if ((pending ?? []).filter((p) => p.status === 'pending').length >= MAX_PENDING) {
    return liteError(429, 'FULL', 'Muitas inscrições aguardando. Fale com o organizador.');
  }
  if ((pending ?? []).some((p) => sameRegistration(p, parsed))) {
    return liteError(409, 'DUPLICATE', 'Este jogador já está inscrito neste torneio.');
  }

  const { error } = await admin.from('lite_registrations').insert({
    tournament_id: tournamentId,
    name: parsed.name,
    birth_year: parsed.birthYear,
    sex: parsed.sex,
    club: parsed.club,
    rating: parsed.rating,
    guardian_name: parsed.guardianName,
    contact: parsed.contact,
  });
  if (error) {
    console.error('[lite/registrations]', error.message);
    return liteError(500, 'SAVE_FAILED', 'Não foi possível enviar a inscrição. Tente de novo.');
  }
  after(() =>
    sendAppUserNotification(
      t.owner_id,
      { title: t.name, body: `Nova inscrição: ${parsed.name}${parsed.birthYear ? ` (${parsed.birthYear})` : ''}` },
      { type: 'registration', tournamentId, name: t.name },
    ).catch((e) => console.error('[lite/registrations] aviso:', e)),
  );
  return NextResponse.json({ ok: true });
}
