import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guards';
import { sendUserNotification } from '@/lib/push';

/**
 * Convite para a equipe do torneio (migration 20261116120000).
 *
 * A RPC `invite_staff` faz toda a checagem (organizador do torneio, conta
 * existe, não é o dono nem a própria pessoa) com o cliente da SESSÃO, e grava
 * o membro como `pending` — sem acesso até aceitar. Esta rota existe só para
 * mandar o push, que precisa das chaves VAPID do servidor. Push que falha não
 * desfaz o convite: ele continua aparecendo no Painel da pessoa.
 */
const ROLES = new Set(['arbiter', 'organizer']);

const KNOWN_ERRORS: Array<[string, number, string]> = [
  ['USER_NOT_FOUND', 404, 'Nenhuma conta encontrada — peça para a pessoa se cadastrar primeiro.'],
  ['SELF_INVITE', 409, 'Você já faz parte da equipe deste torneio.'],
  ['OWNER', 409, 'Esta conta é a dona do torneio.'],
  ['FORBIDDEN', 403, 'Só organizadores do torneio podem convidar.'],
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const gate = await requireUser();
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const role = typeof body?.role === 'string' ? body.role : '';
  if (!email || !ROLES.has(role)) {
    return NextResponse.json({ error: 'Informe o e-mail e o papel.' }, { status: 400 });
  }

  const { data: tournament } = await gate.supabase
    .from('tournaments').select('id, name').eq('slug', slug).maybeSingle();
  if (!tournament) return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });

  const { data, error } = await gate.supabase.rpc('invite_staff', {
    p_tournament_id: tournament.id,
    p_email: email,
    p_role: role as 'arbiter' | 'organizer',
  });
  if (error) {
    const known = KNOWN_ERRORS.find(([code]) => error.message?.includes(code));
    if (known) return NextResponse.json({ error: known[2] }, { status: known[1] });
    console.error('[staff/invite]', error);
    return NextResponse.json({ error: 'Não foi possível enviar o convite.' }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (row?.notify && row.user_id) {
    try {
      await sendUserNotification(row.user_id, {
        title: 'Convite para a equipe',
        body: `Você foi convidado para ser ${role === 'arbiter' ? 'árbitro' : 'organizador'} do ${tournament.name}. Toque para aceitar ou recusar.`,
        url: '/admin',
      });
    } catch (err) {
      console.error('[staff/invite] push falhou:', err);
    }
  }

  return NextResponse.json({ ok: true, invited: !!row?.notify });
}
