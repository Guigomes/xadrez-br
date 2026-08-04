import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NEWS_COVERS_BUCKET } from '@/lib/utils/news';
import type { NewsScope } from '@/types/database';

export const runtime = 'nodejs';

const SCOPES: NewsScope[] = ['state', 'national', 'international'];

/** Gate compartilhado: logado + role='admin'. Devolve o client admin ou a resposta de erro. */
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 }) };
  }
  return { admin: createAdminClient() };
}

/**
 * Atualiza a notícia. Aceita só os campos do editor — nada de repassar o body
 * inteiro pro update, senão dava pra forjar id/created_at.
 *
 * Publicar/despublicar passa por aqui via `status`: publicar carimba
 * published_at só se ainda estiver vazio (republicar preserva a data
 * original), despublicar não apaga nada.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const admin = gate.admin!;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });

  const { data: current } = await admin
    .from('news').select('id, slug, cover_path, published_at, status').eq('id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'Notícia não encontrada.' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Título obrigatório.' }, { status: 400 });
    }
    patch.title = body.title.trim();
  }
  if ('summary' in body)     patch.summary = text(body.summary);
  if ('body_md' in body)     patch.body_md = typeof body.body_md === 'string' ? body.body_md : '';
  if ('cover_alt' in body)   patch.cover_alt = text(body.cover_alt);
  if ('source_name' in body) patch.source_name = text(body.source_name);
  if ('source_url' in body)  patch.source_url = text(body.source_url);

  // Slug só muda enquanto é rascunho — depois de publicado, trocar quebraria
  // qualquer link já divulgado. A guarda é sobre a MUDANÇA, não sobre o campo
  // estar presente: o editor sempre manda o formulário inteiro, então recusar
  // pela presença travaria qualquer edição (inclusive despublicar) de uma
  // notícia já publicada.
  if ('slug' in body) {
    if (typeof body.slug !== 'string' || !body.slug.trim()) {
      return NextResponse.json({ error: 'Endereço obrigatório.' }, { status: 400 });
    }
    const nextSlug = body.slug.trim();
    if (nextSlug !== current.slug) {
      if (current.status === 'published') {
        return NextResponse.json({ error: 'O endereço não pode mudar depois de publicada.' }, { status: 400 });
      }
      patch.slug = nextSlug;
    }
  }

  // scope e state andam juntos: trocar pra nacional/internacional TEM que
  // limpar a UF, senão o check do banco recusa o update inteiro.
  if ('scope' in body) {
    if (typeof body.scope !== 'string' || !SCOPES.includes(body.scope as NewsScope)) {
      return NextResponse.json({ error: 'Abrangência inválida.' }, { status: 400 });
    }
    const scope = body.scope as NewsScope;
    const state = scope === 'state'
      ? (typeof body.state === 'string' ? body.state.toUpperCase() : null)
      : null;
    if (scope === 'state' && !state) {
      return NextResponse.json({ error: 'Notícia estadual precisa de UF.' }, { status: 400 });
    }
    patch.scope = scope;
    patch.state = state;
  }

  // Troca de capa: grava o path novo e apaga o arquivo antigo (melhor esforço
  // — se a remoção falhar, sobra um órfão, não vale derrubar o salvamento).
  let oldCoverToRemove: string | null = null;
  if ('cover_path' in body) {
    const next = text(body.cover_path);
    if (current.cover_path && current.cover_path !== next) oldCoverToRemove = current.cover_path;
    patch.cover_path = next;
  }

  if ('status' in body) {
    if (body.status !== 'draft' && body.status !== 'published') {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === 'published' && !current.published_at) {
      patch.published_at = new Date().toISOString();
    }
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { data, error } = await admin.from('news').update(patch).eq('id', id).select().single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma notícia com esse endereço.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (oldCoverToRemove) {
    await admin.storage.from(NEWS_COVERS_BUCKET).remove([oldCoverToRemove]).catch(() => {});
  }

  return NextResponse.json(data);
}

/** Apaga a notícia e as capas dela (todo o prefixo `<id>/` do bucket). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const admin = gate.admin!;

  // Limpa o storage ANTES de apagar a linha: se der erro aqui, a notícia
  // continua no painel e dá pra tentar de novo — o contrário deixaria
  // arquivos órfãos sem nada apontando pra eles.
  const { data: files } = await admin.storage.from(NEWS_COVERS_BUCKET).list(id);
  if (files?.length) {
    await admin.storage.from(NEWS_COVERS_BUCKET).remove(files.map((f) => `${id}/${f.name}`));
  }

  const { error } = await admin.from('news').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
