import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing, stripLocale, getLocalePrefix } from '@/i18n/routing';
import { resolveLocale } from '@/i18n/detect';
import { updateSession } from '@/lib/supabase/middleware';

const intlMiddleware = createIntlMiddleware(routing);
const LOCALE_COOKIE = 'NEXT_LOCALE';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocalePrefix = routing.locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );

  // 1. Decide o locale-alvo pra quem chegou SEM prefixo na URL. Cookie
  // (escolha explícita, já feita antes) tem prioridade sobre geo/Accept-
  // Language (resolveLocale, primeira visita) — docs/plano-i18n.md §1.4.
  // routing.ts tem localeDetection:false de propósito: isso desliga a
  // detecção EMBUTIDA do next-intl (cookie e Accept-Language, as duas —
  // conferido no source da lib), então sem este bloco um cookie NEXT_LOCALE
  // já gravado seria ignorado pela lib e a pessoa veria pt-BR de novo.
  let localeCookieToConfirm: string | null = null;
  if (!hasLocalePrefix) {
    const cookieValue = request.cookies.get(LOCALE_COOKIE)?.value;
    const validCookie =
      cookieValue && (routing.locales as readonly string[]).includes(cookieValue)
        ? cookieValue
        : null;
    const target =
      validCookie ??
      resolveLocale(
        request.headers.get('x-vercel-ip-country'),
        request.headers.get('accept-language')
      );

    if (target !== routing.defaultLocale) {
      const url = request.nextUrl.clone();
      url.pathname = `/${target}${pathname}`;
      const redirectResponse = NextResponse.redirect(url);
      redirectResponse.cookies.set(LOCALE_COOKIE, target, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
      });
      return redirectResponse;
    }
    // Alvo é o default (pt-BR): a URL sem prefixo já está certa, não
    // redireciona — mas grava/confirma o cookie pra não reavaliar geo de
    // novo na próxima visita (regra: geo só decide uma vez).
    localeCookieToConfirm = validCookie ?? routing.defaultLocale;
  }

  // 2. next-intl: rewrite interno (sem prefixo -> pt-BR) ou passthrough
  // (prefixo /es|/en explícito, já bate um locale suportado).
  const intlResponse = intlMiddleware(request);
  if (localeCookieToConfirm) {
    intlResponse.cookies.set(LOCALE_COOKIE, localeCookieToConfirm, {
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
    });
  }

  // 3. Supabase — usa intlResponse como CARRIER (updateSession não recria a
  // resposta), senão o rewrite/redirect de locale acima seria descartado.
  const { response, user } = await updateSession(request, intlResponse);

  // 4. Redirect "voltar pro último torneio" pra anônimo em '/' — comparado
  // sem o prefixo de locale, preservando o prefixo (se houver) no redirect.
  const bare = stripLocale(pathname);
  if (bare === '/') {
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
        // getLocalePrefix, não `pathname.slice(0, pathname.length -
        // bare.length)`: essa subtração quebra pra pathname === `/${locale}`
        // (ex. '/en'), onde stripLocale devolve '/' — a diferença de
        // comprimento sobra 1 char e corta o prefixo errado ('/en' virava
        // '/e'). Ver i18n/routing.ts.
        const localePrefix = getLocalePrefix(pathname);
        return NextResponse.redirect(
          new URL(`${localePrefix}/tournaments/${lastTournament}`, request.url)
        );
      }
    }
  }

  return response;
}

export const config = {
  // Roda em toda página navegável — o next-intl precisa ver todas pra
  // decidir/rewritar o locale. Fora do matcher: api (rotas não têm locale de
  // URL, docs/plano-i18n.md §1.2), auth (callback OAuth — alvo fixo
  // cadastrado no Google/Supabase, não pode ganhar prefixo de locale), _next
  // e qualquer arquivo estático (com extensão).
  matcher: ['/((?!api|auth|_next|.*\\..*).*)'],
};
