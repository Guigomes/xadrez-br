'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  PROMO_CAMPAIGN,
  PROMO_COOLDOWN_KEY,
  PROMO_DISMISS_KEY,
  PROMO_PLAY_URL,
  isAppleMobile,
  isExcludedPromoPath,
  isPromoSuppressed,
  promoCooldownUntil,
  promoHiddenUntil,
} from '@/lib/promo/banner';

function isEligible(now: number): boolean {
  try {
    return !isPromoSuppressed(
      window.localStorage.getItem(PROMO_DISMISS_KEY),
      window.localStorage.getItem(PROMO_COOLDOWN_KEY),
      now,
    );
  } catch {
    // Sem armazenamento, não há como respeitar o limite entre páginas.
    return false;
  }
}

/**
 * Banner compartilhado pela home e pelas abas do torneio. Conta apenas quando
 * o cartão entra na tela; permanece na página atual depois de contado.
 */
export function PromoBanner() {
  const pathname = usePathname();
  const [eligiblePath, setEligiblePath] = useState<string | null>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const showBanner = !!pathname && eligiblePath === pathname;

  useEffect(() => {
    const eligible = pathname && !isExcludedPromoPath(pathname)
      && !isAppleMobile(navigator.userAgent, navigator.maxTouchPoints)
      && typeof IntersectionObserver !== 'undefined' && isEligible(Date.now());
    setEligiblePath(eligible ? pathname : null);
  }, [pathname]);

  useEffect(() => {
    const card = cardRef.current;
    if (!showBanner || !card) return;

    let inView = false;
    let recorded = false;
    const minimumVisibleRatio = 0.01;

    function recordImpression() {
      if (!inView || recorded || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!isEligible(now)) {
        setEligiblePath(null);
        return;
      }
      try {
        window.localStorage.setItem(PROMO_COOLDOWN_KEY, promoCooldownUntil(now));
        recorded = true;
        observer.disconnect();
      } catch {
        setEligiblePath(null);
      }
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      inView = !!entry?.isIntersecting && entry.intersectionRatio >= minimumVisibleRatio;
      recordImpression();
    }, { threshold: minimumVisibleRatio });
    observer.observe(card);

    function onStorage(event: StorageEvent) {
      if ((event.key === PROMO_DISMISS_KEY || (!recorded && event.key === PROMO_COOLDOWN_KEY))
        && !isEligible(Date.now())) {
        setEligiblePath(null);
      }
    }

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', recordImpression);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', recordImpression);
    };
  }, [showBanner, pathname]);

  if (!showBanner) return null;

  // sendBeacon sobrevive à abertura da loja em outra aba e leva o cookie de
  // sessão (a rota grava quem clicou quando há conta). Falha nunca bloqueia o link.
  function recordClick() {
    try {
      const body = new Blob([JSON.stringify({ campaign: PROMO_CAMPAIGN, path: pathname })], { type: 'application/json' });
      if (!navigator.sendBeacon?.('/api/promo/click', body)) {
        void fetch('/api/promo/click', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
      }
    } catch {
      // Contagem é melhor esforço.
    }
  }

  function dismiss() {
    setEligiblePath(null);
    try {
      window.localStorage.setItem(PROMO_DISMISS_KEY, promoHiddenUntil(Date.now()));
    } catch {
      // Sem armazenamento: esconde só até recarregar.
    }
  }

  return (
    <aside aria-label="Publicidade" className="mx-auto mt-6 max-w-sm sm:mt-8 sm:max-w-[600px]">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        Publicidade
      </p>
      <div className="relative">
        <a
          ref={cardRef}
          href={PROMO_PLAY_URL}
          onClick={recordClick}
          onAuxClick={(event) => { if (event.button === 1) recordClick(); }}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Conhecer Miguel no Reino do Xadrez, disponível para Android"
          className="flex min-h-24 items-center gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white py-3 pl-3 pr-12 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 sm:block sm:min-h-0 sm:border-0 sm:p-0"
        >
          <picture className="relative block size-16 shrink-0 overflow-hidden rounded-lg sm:h-auto sm:w-full sm:rounded-none">
            <source
              media="(min-width: 640px)"
              srcSet="/promo/reino/desktop-1200w.webp 1200w, /promo/reino/desktop-2000w.webp 2000w"
              sizes="(min-width: 648px) 600px, calc(100vw - 48px)"
              width={2000}
              height={667}
            />
            {/* No celular, o recorte destaca Miguel; título e chamada ficam em texto. */}
            <img
              src="/promo/reino/mobile-600w.webp"
              width={600}
              height={500}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute left-[-35%] top-0 block h-auto w-[230%] max-w-none sm:static sm:w-full"
            />
          </picture>
          <div className="min-w-0 sm:hidden">
            <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">Miguel no Reino do Xadrez</p>
            <span className="mt-1 inline-block text-xs font-semibold text-brand-700 dark:text-brand-300">
              Conhecer o jogo <span aria-hidden="true">→</span>
            </span>
          </div>
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar anúncio"
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-base leading-none">
            ×
          </span>
        </button>
      </div>
    </aside>
  );
}
