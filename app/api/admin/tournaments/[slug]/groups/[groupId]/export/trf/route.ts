import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportGroupTrf, GenerateError } from '@/lib/pairing/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; groupId: string }> },
) {
  const { slug, groupId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const { filename, trf } = await exportGroupTrf(supabase, slug, groupId);
    return new NextResponse(trf, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    if (e instanceof GenerateError) {
      const status = e.code === 'NOT_FOUND' ? 404 : 422;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error('export trf failed:', e);
    return NextResponse.json({ error: 'Erro ao gerar TRF' }, { status: 500 });
  }
}
