import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  if (request.nextUrl.pathname === '/') {
    const bypass = request.nextUrl.searchParams.get('home');
    if (bypass) {
      // Pediu a home explicitamente (logo/atalho): apaga o cookie pra que o
      // próximo `/` limpo — URL digitada, atalho da PWA, "voltar ao início" —
      // também caia na home em vez de voltar pro último torneio.
      response.cookies.set('last_tournament', '', { maxAge: 0, path: '/' });
    } else if (!user) {
      // Só sequestra pro último torneio quem NÃO está logado. Organizador tem
      // a própria home (lista de torneios) e nunca deve ser redirecionado.
      const lastTournament = request.cookies.get('last_tournament')?.value;
      if (lastTournament) {
        return NextResponse.redirect(new URL(`/tournaments/${lastTournament}`, request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/', '/admin/:path*'],
};
