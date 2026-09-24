import { defineRouting } from 'next-intl/routing';

// Fonte única dos locais suportados. pt-BR é o default e continua SEM prefixo
// de URL (localePrefix 'as-needed') — toda URL pt-BR de hoje segue válida byte
// a byte; es e en ganham os ramos /es e /en. Ver docs/plano-i18n.md §1.2/§1.3.
//
// localeDetection: false — a detecção por geo (x-vercel-ip-country) é nossa,
// em i18n/detect.ts, não a de Accept-Language embutida do next-intl.
export const routing = defineRouting({
  locales: ['pt-BR', 'es', 'en'],
  defaultLocale: 'pt-BR',
  localePrefix: 'as-needed',
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];

/**
 * Remove o prefixo de locale de um pathname, se houver (`/en/admin` ->
 * `/admin`; `/en` -> `/`; `/admin` -> `/admin`, sem mudança). Usada pelo
 * middleware pra comparar rota (proteção de /admin, redirect do
 * last_tournament) sem se importar com o idioma da URL — ver
 * docs/plano-i18n.md §2.3 ponto 2.
 */
export function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return '/';
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

/**
 * O prefixo de locale de um pathname, se houver (`/en/admin` -> `/en`;
 * `/en` -> `/en`; `/admin` -> `''`, pt-BR sem prefixo). Complementar a
 * `stripLocale` — junto, `getLocalePrefix(p) + stripLocale(p)` reconstrói o
 * pathname original só quando `stripLocale` não é `/` (ver a pegadinha
 * abaixo). Existe separado de `stripLocale` porque subtrair comprimentos
 * (`pathname.length - bare.length`) quebra exatamente no caso `/en` ->
 * `/` (bare tem 1 char de sobra, o `/` — um redirect pra `/torneios/x`
 * virava `/e/torneios/x`, sumindo o "n"). Não redescobrir esse bug.
 */
export function getLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) return `/${locale}`;
  }
  return '';
}
