import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Wrappers locale-aware de Link/useRouter/usePathname/redirect/getPathname.
// A Fase 0 vai trocar TODO `next/link` e `next/navigation` de navegação interna
// por estes — sem isso, com localePrefix 'as-needed' um usuário em /es ou /en
// que clica num Link cru cai de volta pro pt-BR (docs/plano-i18n.md §2.4).
//
// DORMENTE até a Fase 0 — nada importa daqui hoje.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
