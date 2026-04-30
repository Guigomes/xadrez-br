import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    const bypass = request.nextUrl.searchParams.get('home');
    if (!bypass) {
      const lastTournament = request.cookies.get('last_tournament')?.value;
      if (lastTournament) {
        return NextResponse.redirect(new URL(`/tournaments/${lastTournament}`, request.url));
      }
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: ['/', '/admin/:path*'],
};
