import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Volta do OAuth (Google): troca o `code` da URL pela sessão (grava cookie
// via createClient — mesmo client cookie-based usado no resto do app) e
// redireciona pra onde a pessoa ia (?next=, default /admin). handle_new_user
// (migration 001) já cuida de criar a linha em user_profiles pra conta nova,
// igual faz pra cadastro por e-mail/senha — mesmo trigger, não importa a
// origem do auth.users.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/admin';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[auth/callback] exchangeCodeForSession falhou:', error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
