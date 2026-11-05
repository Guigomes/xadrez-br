import { describe, expect, it } from 'vitest';
import {
  PROMO_PLAY_URL,
  isAppleMobile,
  isExcludedPromoPath,
  isPromoDismissed,
  parsePromoSetting,
  promoHiddenUntil,
} from '../promo/banner';

describe('banner do jogo', () => {
  it('fica fora do painel de TV e da inscrição, com ou sem locale', () => {
    expect(isExcludedPromoPath('/torneios/x/painel')).toBe(true);
    expect(isExcludedPromoPath('/en/torneios/x/painel')).toBe(true);
    expect(isExcludedPromoPath('/torneios/x/inscricao')).toBe(true);
    expect(isExcludedPromoPath('/torneios/x/rodadas/3')).toBe(false);
    expect(isExcludedPromoPath('/torneios/x/classificacao')).toBe(false);
    expect(isExcludedPromoPath(null)).toBe(false);
  });

  it('não aparece em iPhone/iPad (jogo só para Android)', () => {
    expect(isAppleMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isAppleMobile('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(false);
    expect(isAppleMobile(undefined)).toBe(false);
  });

  it('fechar esconde por 7 dias e volta depois', () => {
    const now = Date.UTC(2026, 10, 5);
    const stored = promoHiddenUntil(now);
    expect(isPromoDismissed(stored, now + 6 * 86_400_000)).toBe(true);
    expect(isPromoDismissed(stored, now + 7 * 86_400_000 + 1)).toBe(false);
    expect(isPromoDismissed(null, now)).toBe(false);
    expect(isPromoDismissed('lixo', now)).toBe(false);
  });

  it('interruptor só liga com true', () => {
    expect(parsePromoSetting(true)).toBe(true);
    expect(parsePromoSetting('true')).toBe(true);
    expect(parsePromoSetting(false)).toBe(false);
    expect(parsePromoSetting(null)).toBe(false);
    expect(parsePromoSetting({ enabled: true })).toBe(false);
  });

  it('link leva origem para o Play Console', () => {
    const url = new URL(PROMO_PLAY_URL);
    expect(url.searchParams.get('id')).toBe('app.miguelxadrez.game');
    expect(url.searchParams.get('referrer')).toBe(
      'utm_source=gambito_torneios&utm_medium=banner&utm_campaign=reino_xadrez&utm_content=home_v1',
    );
  });
});
