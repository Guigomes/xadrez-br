import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/api/guards';
import { readJson } from '@/lib/api/validation';

/**
 * Este aparelho recebe os avisos da conta logada? POST (e não GET) para o
 * endpoint de push não ir parar em URL/log de acesso.
 */
const StatusSchema = z.object({ endpoint: z.string().min(1).max(1000) });

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if (!gate.ok) return gate.response;
  const parsed = await readJson(request, StatusSchema, 'Inválido.');
  if (!parsed.ok) return parsed.response;

  const { data: row } = await createAdminClient()
    .from('push_subscriptions').select('user_id')
    .eq('endpoint', parsed.data.endpoint).maybeSingle();
  return NextResponse.json({ linked: row?.user_id === gate.user.id });
}
