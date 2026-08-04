import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils/chess';
import type { NewsScope } from '@/types/database';

export const runtime = 'nodejs';

const SCOPES: NewsScope[] = ['state', 'national', 'international'];

/**
 * Cria uma notícia como rascunho — o editor (/admin/dev/noticias/[id])
 * precisa de um id estável antes de qualquer upload de capa, por isso a
 * criação vem separada da edição em vez de ser um formulário "salvar tudo
 * de uma vez".
 *
 * Escrita por createAdminClient() (service role): a tabela news não tem
 * policy de insert/update/delete de propósito, mesma convenção de
 * error_logs/unanswered_questions. O gate de admin é este 403 aqui — o
 * useProfile() do painel é só cosmético.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const title: unknown = body?.title;
  const scope: unknown = body?.scope;
  const state: unknown = body?.state;

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Título obrigatório.' }, { status: 400 });
  }
  if (typeof scope !== 'string' || !SCOPES.includes(scope as NewsScope)) {
    return NextResponse.json({ error: 'Abrangência inválida.' }, { status: 400 });
  }
  // O check do banco (news_scope_state_coherent) recusaria de qualquer jeito,
  // mas devolver 400 com mensagem em português é melhor que vazar erro do PG.
  const normalizedState = scope === 'state' ? (typeof state === 'string' ? state.toUpperCase() : null) : null;
  if (scope === 'state' && !normalizedState) {
    return NextResponse.json({ error: 'Notícia estadual precisa de UF.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const base = slugify(title) || 'noticia';

  // Colisão de slug: tenta o base, depois -2, -3… Deixa o unique do banco ser
  // o juiz (em vez de consultar antes) — sem corrida entre checar e inserir.
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const { data, error } = await admin
      .from('news')
      .insert({
        slug,
        title: title.trim(),
        scope: scope as NewsScope,
        state: normalizedState,
        status: 'draft',
        author_id: user.id,
      })
      .select('id, slug')
      .single();

    if (!error) return NextResponse.json(data);
    if (error.code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Não foi possível gerar um endereço único para esta notícia.' }, { status: 409 });
}
