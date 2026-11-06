/**
 * Banner do jogo "Miguel no Reino do Xadrez" (app Android do mesmo dono do Gambito).
 * Regras puras: o componente (`components/promo/promo-banner.tsx`) só decide o que
 * mostrar a partir destas funções; o interruptor fica em `app_settings.promo_banner_enabled`.
 */

// Link de campanha criado pelo dono (install referrer da Play Store: a origem aparece
// no Play Console, sem rastreador no site). Usar exatamente como veio.
export const PROMO_PLAY_URL =
  'https://play.google.com/store/apps/details?id=app.miguelxadrez.game&referrer=utm_source%3Dgambito_torneios%26utm_medium%3Dbanner%26utm_campaign%3Dreino_xadrez%26utm_content%3Dhome_v1';

/** Identificação da campanha nos cliques gravados (promo_clicks.campaign) — mesma do link acima. */
export const PROMO_CAMPAIGN = 'reino_xadrez:home_v1';

/** Chave do localStorage com o instante (ms) até quando o banner fica escondido. */
export const PROMO_DISMISS_KEY = 'gambito_promo_reino_hidden_until';
export const PROMO_DISMISS_DAYS = 7;
export const PROMO_COOLDOWN_KEY = 'gambito_promo_reino_seen_until';
export const PROMO_COOLDOWN_HOURS = 48;

/** Abas do torneio onde o banner nunca aparece: TV (tela cheia) e formulário de inscrição. */
const EXCLUDED_SEGMENTS = ['/painel', '/inscricao'];

export function isExcludedPromoPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return EXCLUDED_SEGMENTS.some((segment) => pathname.endsWith(segment) || pathname.includes(`${segment}/`));
}

/** O jogo só existe para Android: no iPhone/iPad o link cairia numa loja que não instala. */
export function isAppleMobile(userAgent: string | null | undefined, maxTouchPoints = 0): boolean {
  if (!userAgent) return false;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS se apresenta como Mac; o que denuncia é a tela de toque.
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function isPromoDismissed(storedValue: string | null | undefined, now: number): boolean {
  const until = Number(storedValue);
  return Number.isFinite(until) && until > now;
}

export function promoHiddenUntil(now: number): string {
  return String(now + PROMO_DISMISS_DAYS * 24 * 60 * 60 * 1000);
}

export function promoCooldownUntil(now: number): string {
  return String(now + PROMO_COOLDOWN_HOURS * 60 * 60 * 1000);
}

export function isPromoSuppressed(dismissedUntil: string | null, seenUntil: string | null, now: number): boolean {
  return isPromoDismissed(dismissedUntil, now) || isPromoDismissed(seenUntil, now);
}

/** Valor jsonb de `app_settings`: só `true` liga. Ausente, inválido ou erro = desligado. */
export function parsePromoSetting(value: unknown): boolean {
  return value === true || value === 'true';
}
