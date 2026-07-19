import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateRoundDraft, GenerateError } from '@/lib/pairing/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; groupId: string }> },
) {
  const { slug, groupId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  let roundNumber: number | undefined;
  try {
    const body = await req.json();
    if (body?.roundNumber != null) roundNumber = Number(body.roundNumber);
  } catch { /* corpo vazio = próxima rodada */ }

  try {
    const result = await generateRoundDraft(supabase, slug, groupId, roundNumber);
    return NextResponse.json(result);
  } catch (e: any) {
    if (e instanceof GenerateError) {
      const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'FORBIDDEN' ? 403 : 422;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error('generate round failed:', e);
    return NextResponse.json({ error: 'Erro interno ao gerar rodada' }, { status: 500 });
  }
}
