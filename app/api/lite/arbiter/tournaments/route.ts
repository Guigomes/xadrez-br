import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBearerUser, liteError } from '@/lib/lite/server';
import { arbiterView, normalizeEmail, type ArbiterBackup } from '@/lib/lite/arbiter';

/** Torneios do Gambito Lite em que a conta é árbitro (pelo e-mail da conta Google). */
export async function GET(request: Request) {
  const user = await getBearerUser(request);
  if (!user?.email) return liteError(401, 'UNAUTHORIZED', 'Entre de novo com sua conta.');
  const email = normalizeEmail(user.email);

  const admin = createAdminClient();
  const { data: rows, error } = await admin.from('lite_tournament_arbiters').select('tournament_id').eq('email', email);
  if (error) return liteError(500, 'LIST_FAILED', 'Não foi possível listar os torneios.');
  const ids = (rows ?? []).map((r) => r.tournament_id);
  if (!ids.length) return NextResponse.json({ tournaments: [] });

  const { data: lite } = await admin.from('lite_tournaments').select('id, backup, updated_at, owner_id').in('id', ids);
  const ownerIds = [...new Set((lite ?? []).map((l) => l.owner_id))];
  const { data: owners } = ownerIds.length
    ? await admin.from('user_profiles').select('id, full_name').in('id', ownerIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.full_name]));

  const tournaments = (lite ?? [])
    .map((l) => {
      const view = arbiterView(l.backup as unknown as ArbiterBackup, email);
      if (!view) return null;
      return {
        id: view.tournamentId,
        name: view.tournamentName,
        organizer: ownerName.get(l.owner_id) ?? null,
        round: view.round,
        roundsTotal: view.roundsTotal,
        myBoards: view.boards.length,
        pending: view.boards.filter((b) => b.result === '*').length,
        updatedAt: l.updated_at,
      };
    })
    .filter((x) => x !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return NextResponse.json({ tournaments });
}
