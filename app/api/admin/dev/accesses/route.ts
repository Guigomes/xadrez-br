import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import type { AccessDashboardData } from '@/lib/analytics/types';
import type { DeviceType } from '@/lib/analytics/device';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return profile?.role === 'admin';
}

export async function GET() {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const since24Hours = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7Days = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30Days = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [last24, last7, last30, devicesResult, eventsResult] = await Promise.all([
    admin.from('site_access_events').select('id', { count: 'exact', head: true }).gte('visited_at', since24Hours),
    admin.from('site_access_events').select('id', { count: 'exact', head: true }).gte('visited_at', since7Days),
    admin.from('site_access_events').select('id', { count: 'exact', head: true }).gte('visited_at', since30Days),
    admin.from('site_devices').select('*').order('last_seen_at', { ascending: false }).limit(500),
    admin
      .from('site_access_events')
      .select('id, device_id, path, visited_at')
      .gte('visited_at', since30Days)
      .order('visited_at', { ascending: false })
      .limit(10_000),
  ]);

  const firstError = last24.error || last7.error || last30.error || devicesResult.error || eventsResult.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const followedPlayerIds = [...new Set(
    (devicesResult.data ?? []).flatMap((device) => device.followed_player_ids)
  )].slice(0, 500);
  const followedPlayersResult = followedPlayerIds.length
    ? await admin.from('players').select('id, full_name').in('id', followedPlayerIds)
    : { data: [], error: null };
  if (followedPlayersResult.error) {
    return NextResponse.json({ error: followedPlayersResult.error.message }, { status: 500 });
  }
  const playerNameById = new Map(
    (followedPlayersResult.data ?? []).map((player) => [player.id, player.full_name])
  );

  const events = eventsResult.data ?? [];
  const viewsByDevice = new Map<string, number>();
  for (const event of events) {
    viewsByDevice.set(event.device_id, (viewsByDevice.get(event.device_id) ?? 0) + 1);
  }

  const devices = (devicesResult.data ?? []).map((device) => ({
    id: device.id,
    deviceType: device.device_type as DeviceType,
    browser: device.browser,
    os: device.os,
    isOwner: device.is_owner,
    ownerLabel: device.owner_label,
    firstSeenAt: device.first_seen_at,
    lastSeenAt: device.last_seen_at,
    lastPath: device.last_path,
    views30Days: viewsByDevice.get(device.id) ?? 0,
    followedPlayers: device.followed_player_ids
      .map((id) => ({ id, name: playerNameById.get(id) }))
      .filter((player): player is { id: string; name: string } => Boolean(player.name)),
  }));
  const deviceById = new Map(devices.map((device) => [device.id, device]));

  const data: AccessDashboardData = {
    summary: {
      last24Hours: last24.count ?? 0,
      last7Days: last7.count ?? 0,
      last30Days: last30.count ?? 0,
      uniqueDevices30Days: viewsByDevice.size,
    },
    devices,
    recent: events.slice(0, 100).map((event) => {
      const device = deviceById.get(event.device_id);
      return {
        id: event.id,
        deviceId: event.device_id,
        path: event.path,
        visitedAt: event.visited_at,
        isOwner: device?.isOwner ?? false,
        ownerLabel: device?.ownerLabel ?? null,
        deviceType: device?.deviceType ?? 'other',
        browser: device?.browser ?? 'Desconhecido',
        os: device?.os ?? 'Desconhecido',
        followedPlayers: device?.followedPlayers ?? [],
      };
    }),
  };

  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
  const owner = body?.isOwner;
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 80) : '';

  if (!deviceId || typeof owner !== 'boolean' || (owner && !label)) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_devices')
    .update({ is_owner: owner, owner_label: owner ? label : null })
    .eq('id', deviceId)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Aparelho não encontrado.' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
