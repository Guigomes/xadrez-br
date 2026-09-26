import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { DeviceType } from '@/lib/analytics/device';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_TYPES = new Set<DeviceType>(['desktop', 'mobile', 'tablet', 'other']);

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const deviceId = cleanText(body?.deviceId, 36);
  const path = cleanText(body?.path, 500);
  const browser = cleanText(body?.browser, 80);
  const os = cleanText(body?.os, 80);
  const deviceType = cleanText(body?.deviceType, 20) as DeviceType | null;

  if (
    !deviceId || !UUID_PATTERN.test(deviceId) ||
    !path || !path.startsWith('/') ||
    !browser || !os || !deviceType || !DEVICE_TYPES.has(deviceType)
  ) {
    return NextResponse.json({ error: 'Acesso inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const deviceUpdate = {
    device_type: deviceType,
    browser,
    os,
    last_seen_at: now,
    last_path: path,
  };

  const { data: existing, error: updateError } = await admin
    .from('site_devices')
    .update(deviceUpdate)
    .eq('id', deviceId)
    .select('id')
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: 'Não foi possível registrar o acesso.' }, { status: 500 });
  }

  if (!existing) {
    const { error: insertDeviceError } = await admin.from('site_devices').insert({
      id: deviceId,
      ...deviceUpdate,
      first_seen_at: now,
    });

    // Duas abas podem tentar criar o mesmo aparelho ao mesmo tempo. Se outra
    // requisição ganhou a corrida, a linha já existe e podemos seguir.
    if (insertDeviceError && insertDeviceError.code !== '23505') {
      return NextResponse.json({ error: 'Não foi possível registrar o aparelho.' }, { status: 500 });
    }
  }

  const { error: eventError } = await admin.from('site_access_events').insert({
    device_id: deviceId,
    path,
    user_id: null,
    visited_at: now,
  });

  if (eventError) {
    return NextResponse.json({ error: 'Não foi possível registrar a visualização.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
