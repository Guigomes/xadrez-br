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
