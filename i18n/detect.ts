// Resolução de locale a partir de sinais de request (geo + Accept-Language).
// Função PURA e sem dependência de next-intl de propósito: é a peça mais
// testável do i18n e a que codifica a decisão pt-BR/es/en (docs/plano-i18n.md
// §1.4). O middleware da Fase 0 vai chamar isto; até lá, nada a usa.
//
// Import relativo (não '@/...') de propósito: vitest não tem o alias '@/'
// configurado para valor em runtime — mesmo motivo de lib/utils/classification-
// match.ts.
import { routing, type AppLocale } from './routing';

// Países onde o espanhol é a língua majoritária de uso na web (ISO-3166-1
// alpha-2). Lista FECHADA e revisável — deixa de fora Belize/EUA/Andorra de
// propósito (espanhol não é a língua de uso majoritária deles). Território
// minúsculo não entra: o cookie e o seletor cobrem o caso raro. Ver §1.4.
export const SPANISH_COUNTRIES: ReadonlySet<string> = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GT', 'GQ',
  'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE',
]);

/**
 * Extrai o idioma base (`pt`, `es`, `en`, ...) do primeiro tag de um header
 * Accept-Language. `pt-BR,pt;q=0.9,en;q=0.8` -> `pt`. Ignora o peso `q` do
 * primeiro item (o primeiro é sempre o de maior prioridade na prática dos
 * navegadores). Retorna null se o header for vazio/ausente.
 */
export function primaryLanguage(acceptLanguage: string | null | undefined): string | null {
  if (!acceptLanguage) return null;
  const first = acceptLanguage.split(',')[0]?.trim();
  if (!first) return null;
  const tag = first.split(';')[0]?.trim().toLowerCase();
  if (!tag) return null;
  return tag.split('-')[0] || null;
}

/**
 * Locale-alvo para a PRIMEIRA visita a uma URL sem prefixo e sem cookie
 * NEXT_LOCALE. Prioridade (§1.4): geo primeiro, Accept-Language como fallback
 * quando não há geo (dev local, outro host). País nunca "sobrescreve" pra pior:
 * BR sempre pt-BR, país hispano sempre es, resto en.
 *
 * NÃO decide sozinho quando já existe cookie ou prefixo — isso é responsabilidade
 * do middleware, que só chama esta função no caso de primeira visita.
 */
export function resolveLocale(
  country: string | null | undefined,
  acceptLanguage: string | null | undefined,
): AppLocale {
  const cc = country?.toUpperCase();

  // 1. Geo tem prioridade — é o sinal mais confiável de onde a pessoa está.
  if (cc === 'BR') return 'pt-BR';
  if (cc && SPANISH_COUNTRIES.has(cc)) return 'es';
  // País conhecido e não-hispano/não-BR: inglês, sem consultar Accept-Language
  // (o refinamento "hispano morando nos EUA" é melhoria futura, ver §1.4).
  if (cc) return 'en';

  // 2. Sem geo (dev local, host sem o header da Vercel): Accept-Language.
  const lang = primaryLanguage(acceptLanguage);
  if (lang === 'pt') return 'pt-BR';
  if (lang === 'es') return 'es';
  if (lang === 'en') return 'en';

  // 3. Default.
  return routing.defaultLocale;
}
