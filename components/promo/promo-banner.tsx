'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  PROMO_DISMISS_KEY,
  PROMO_PLAY_URL,
  isAppleMobile,
  isExcludedPromoPath,
  isPromoDismissed,
  promoHiddenUntil,
} from '@/lib/promo/banner';

/**
 * Banner do jogo "Miguel no Reino do Xadrez" no fim das abas do torneio.
 * Só aparece depois de montar no navegador (precisa do user agent e do localStorage),
 * então não entra no HTML do servidor nem atrasa a página. Fechar esconde por 7 dias,
 * só neste aparelho. Imagens: `public/promo/reino/` (geradas por docs/banner-reino/compose.py).
 */
export function PromoBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = isPromoDismissed(window.localStorage.getItem(PROMO_DISMISS_KEY), Date.now());
    } catch {
      // localStorage bloqueado (aba anônima, cookies desligados): mostra normalmente.
    }
    setVisible(!dismissed && !isAppleMobile(navigator.userAgent, navigator.maxTouchPoints));
  }, []);

  if (!visible || isExcludedPromoPath(pathname)) return null;

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(PROMO_DISMISS_KEY, promoHiddenUntil(Date.now()));
    } catch {
      // Sem armazenamento: esconde só até recarregar.
    }
  }

  return (
    <aside aria-label="Publicidade" className="mx-auto mt-10 max-w-sm sm:max-w-3xl">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        Publicidade
      </p>
      <div className="relative">
        <a
          href={PROMO_PLAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-xl shadow-sm transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <picture>
            <source
              media="(min-width: 640px)"
              srcSet="/promo/reino/desktop-1200w.webp 1200w, /promo/reino/desktop-2000w.webp 2000w"
              sizes="768px"
              width={2000}
              height={667}
            />
            {/* <img> dentro de <picture>: direção de arte (outra imagem no celular), que next/image não faz. */}
            <img
              src="/promo/reino/mobile-600w.webp"
              srcSet="/promo/reino/mobile-600w.webp 600w, /promo/reino/mobile-900w.webp 900w"
              sizes="(max-width: 639px) 384px, 768px"
              width={1200}
              height={1000}
              alt="Miguel no Reino do Xadrez: conheça o jogo, disponível para Android"
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </picture>
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
