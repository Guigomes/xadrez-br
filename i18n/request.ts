import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

// Carrega o dicionário do locale pedido. O spread do pt-BR por baixo é um
// fallback de NÍVEL DE NAMESPACE (namespace inteiro ausente em es/en cai no
// pt-BR). A garantia real de completude POR CHAVE é o teste de paridade
// (i18n/__tests__/messages-parity.test.ts), que falha o build se qualquer
// chave existir num idioma e faltar no outro — por isso o spread raso basta.
// Ver docs/plano-i18n.md §1.3/§2.1/§7.
//
// DORMENTE até a Fase 0 mover a árvore para app/[locale] — nada chama isto hoje.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const defaultMessages = (await import('../messages/pt-BR.json')).default;
  const messages =
    locale === routing.defaultLocale
      ? defaultMessages
      : { ...defaultMessages, ...(await import(`../messages/${locale}.json`)).default };

  return { locale, messages };
});
