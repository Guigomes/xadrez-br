import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBearerUser, liteError, tournamentUrl } from '@/lib/lite/server';

/** Torneios do Gambito Lite guardados na conta (para restaurar em outro aparelho). */
export async function GET(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return liteError(401, 'UNAUTHORIZED', 'Entre de novo com sua conta.');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lite_tournaments')
    .select('id, name, is_public, device_id, app_version, updated_at, site_tournament_id, tournaments:site_tournament_id(slug)')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) return liteError(500, 'LIST_FAILED', 'Não foi possível listar os torneios.');

  return NextResponse.json({
    tournaments: (data ?? []).map((r) => {
      const slug = (r.tournaments as { slug: string } | null)?.slug ?? null;
      return {
        id: r.id,
        name: r.name,
        isPublic: r.is_public,
        deviceId: r.device_id,
        appVersion: r.app_version,
        updatedAt: r.updated_at,
        url: r.is_public && slug ? tournamentUrl(slug) : null,
      };
    }),
  });
}
