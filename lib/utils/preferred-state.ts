import { BR_STATES } from '@/lib/utils/chess';

/**
 * Último estado (UF) escolhido no filtro de torneios, guardado em cookie
 * próprio do site para a tela inicial já abrir filtrada no servidor (o HTML
 * chega pronto, sem piscar a lista de todos os estados). É só preferência de
 * navegação: não identifica ninguém e não sai do domínio.
 */
export const PREFERRED_STATE_COOKIE = 'pref_uf';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** UF válida em maiúsculas, ou null (vazio/valor desconhecido = todos os estados). */
export function parsePreferredState(value: string | null | undefined): string | null {
  const uf = (value ?? '').trim().toUpperCase();
  return BR_STATES.some((s) => s.uf === uf) ? uf : null;
}

/** Grava (ou apaga, com vazio) a preferência. Só no navegador. */
export function savePreferredState(uf: string): void {
  const valid = parsePreferredState(uf);
  document.cookie = valid
    ? `${PREFERRED_STATE_COOKIE}=${valid}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`
    : `${PREFERRED_STATE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
