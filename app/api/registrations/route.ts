import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createClient } from '@/lib/supabase/server';

const optionalText = z.string().nullable().optional();
const schema = z.object({
  tournament_id: z.string().uuid(),
  full_name: z.string().trim().min(5).max(200),
  category_id: z.string().uuid().nullable().optional(),
  birth_year: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  sex: z.enum(['m', 'w']).nullable().optional(),
  city: optionalText,
  state: optionalText,
  club_or_school: optionalText,
  federation: z.string().length(3).transform((value) => value.toUpperCase()).default('BRA'),
  fide_id: z.string().regex(/^\d*$/).nullable().optional(),
  cbx_id: z.string().regex(/^\d*$/).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: optionalText,
  cpf_cnpj: z.string().regex(/^\d*$/).nullable().optional(),
  payment_receipt_path: optionalText,
}).strict();

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados de inscrição inválidos.' }, { status: 400 });
  }

  const supabase = await createClient();
  // Generate the ID here: the caller cannot use this endpoint to read an
  // existing registration. Keep the INSERT subject to the caller's RLS and
  // triggers (registration window, capacity, payment and account identity).
  const id = randomUUID();
  const { error } = await supabase.from('tournament_registrations')
    .insert({ ...parsed.data, id });
  // Do not chain .select(): anonymous participants may create registrations,
  // but only organizers may read their private details.
  if (error) {
    return NextResponse.json({ error: error.message }, {
      status: error.code === '42501' ? 403 : 400,
    });
  }

  // Read only the confirmation of this successful INSERT, never user-supplied
  // IDs or contact information. No public SELECT policy is needed.
  const { data: registration, error: readError } = await createAdminClient()
    .from('tournament_registrations')
    .select('id, payment_status, is_waitlisted')
    .eq('id', id)
    .single();
  if (readError || !registration) {
    return NextResponse.json({ error: 'Não foi possível confirmar a inscrição. Consulte a organização antes de tentar novamente.' }, { status: 500 });
  }

  return NextResponse.json(registration, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' },
  });
}
