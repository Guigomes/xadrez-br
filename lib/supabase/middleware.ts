import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { stripLocale, getLocalePrefix } from '@/i18n/routing';

/**
 * `carrierResponse` é a resposta que o middleware do next-intl já produziu
 * (rewrite pro locale certo, ou redirect) — NUNCA recriar com
 * `NextResponse.next({ request })` aqui dentro. Fazer isso descartaria o
 * rewrite do next-intl e a URL certa deixaria de ser servida (era assim que
 * este arquivo funcionava antes da Fase 0 — sozinho, dono da própria
 * resposta; agora ele só ACRESCENTA cookies na resposta que já existe). Ver
 * docs/plano-i18n.md §2.3 ponto 1.
 */
export async function updateSession(request: NextRequest, carrierResponse: NextResponse) {
  const response = carrierResponse;

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Só grava os cookies NA MESMA instância de response (o carrier) —
          // nunca trocar por uma nova, senão perde o rewrite de novo.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protege rotas /admin — comparado sem o prefixo de locale, senão
  // /en/admin ou /es/admin passariam direto sem checar sessão.
  const bare = stripLocale(request.nextUrl.pathname);
  const isAdminRoute = bare.startsWith('/admin');
  if (isAdminRoute && !user) {
    // getLocalePrefix, não subtração de comprimento — ver o comentário em
    // i18n/routing.ts e o mesmo fix em middleware.ts (bug real achado ali:
    // '/en' cortava pra '/e'). Não repetir o padrão aqui, mesmo que hoje
    // não dispare de fato (isAdminRoute nunca é true com bare === '/').
    const localePrefix = getLocalePrefix(request.nextUrl.pathname);
    const loginUrl = new URL(`${localePrefix}/login`, request.url);
    loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return { response: NextResponse.redirect(loginUrl), user };
  }

  // Devolve o user junto pra o middleware decidir o redirect da home sem um
  // segundo getUser() (ver middleware.ts).
  return { response, user };
}
