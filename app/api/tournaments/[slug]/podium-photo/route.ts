import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { buildPodiumOptions } from '@/lib/tournament/podium';
import { playerPhotoPath, PLAYER_PHOTOS_BUCKET } from '@/lib/player-photos/config';
import type { Database, StandingRow } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const missing = () => new NextResponse(null, { status: 404, headers });

/** Narrow public read: only an actual podium winner in a finished, link-visible event.
 * No signed URL, arbitrary storage path, admin cookie or public bucket is needed. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const player = request.nextUrl.searchParams.get('player') ?? '';
  const category = request.nextUrl.searchParams.get('category') ?? '';
  const path = playerPhotoPath(player);
  if (!path || !category || category.length > 200 || slug.length > 200) return missing();
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: tournament, error } = await client.from('tournaments')
    .select('id, status, has_absolute_classification, has_female_classification').eq('slug', slug).maybeSingle();
  if (error || !tournament || tournament.status !== 'finished') return missing();
  const result = await client.rpc('get_tournament_standings', { p_tournament_id: tournament.id });
  if (result.error) return missing();
  const option = buildPodiumOptions((result.data ?? []) as StandingRow[], tournament).find((item) => item.id === category);
  if (!option?.players.some((winner) => winner.playerId.toLowerCase() === player.toLowerCase())) return missing();

  // Privileged access starts only AFTER checking the public event and winning player.
  const photo = await createAdminClient().storage.from(PLAYER_PHOTOS_BUCKET).download(path);
  if (photo.error || !photo.data) return missing();
  return new NextResponse(photo.data, { headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Disposition': 'inline; filename="podium-player.webp"' } });
}
