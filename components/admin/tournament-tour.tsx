'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Driver } from 'driver.js';
import { matchRoute, stepsForRoute, nextStepAfter } from '@/lib/tour/steps';
import {
  readProgress,
  writeProgress,
  clearProgress,
  dismiss,
  TOUR_START_EVENT,
  TOUR_ENABLED,
} from '@/lib/tour/state';

const sel = (target: string) => `[data-tour="${target}"]`;

// driver.js grava title/description via innerHTML (não textContent), então dá
// pra injetar o avatar do Gambito junto do título sem tocar em cada string de
// lib/tour/steps.ts — ele "fala" o tour como interlocutor.
function withMascot(title: string): string {
  return `<span class="xbr-tour-title-row"><img src="/mascot/gambito-acenando.png" alt="" class="xbr-tour-avatar" />${title}</span>`;
}

/**
 * Espera o alvo existir no DOM.
 *
 * Necessário porque /edit e /players renderizam <PageSpinner /> enquanto o
 * React Query resolve — montar o spotlight antes disso ancoraria em nada. Em
 * /edit há um agravante: um window.scrollTo(0,0) dispara quando o bloco de
 * classificação termina de montar (ver o comentário em
 * classification-setup.tsx), e o recorte do overlay ficaria desalinhado se o
 * tour começasse antes.
 */
function waitForTarget(selector: string, timeoutMs: number): Promise<boolean> {
  if (document.querySelector(selector)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer = 0;
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) finish(true);
    });
    function finish(found: boolean) {
      window.clearTimeout(timer);
      observer.disconnect();
      resolve(found);
    }
    timer = window.setTimeout(() => finish(false), timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Tour guiado da criação de torneio.
 *
 * Montado uma única vez em app/admin/layout.tsx — ancestral comum das quatro
 * rotas do fluxo — para sobreviver às navegações no meio do caminho.
 *
 * O tour não navega sozinho: exibe o bloco de passos da rota atual, grava onde
 * parou e se cala. Quem clica em "Novo torneio" e submete o formulário é o
 * organizador; ao chegar na tela seguinte, este componente vê o progresso
 * pendente e retoma. Fechar o tour (× ou Esc) equivale a dispensá-lo de vez —
 * o botão de ajuda em /admin traz de volta.
 */
export function TournamentTour() {
  const pathname = usePathname();
  const [runId, setRunId] = useState(0);

  // O botão de ajuda já gravou o progresso antes de disparar o evento; aqui só
  // reexecutamos o efeito, que é quem sabe montar o driver.
  useEffect(() => {
    const rerun = () => setRunId((n) => n + 1);
    window.addEventListener(TOUR_START_EVENT, rerun);
    return () => window.removeEventListener(TOUR_START_EVENT, rerun);
  }, []);

  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    // Tour desligado temporariamente (TOUR_ENABLED): runner nunca monta o driver.
    if (!TOUR_ENABLED) return;
    const route = matchRoute(pathname);
    if (!route) return;

    const block = stepsForRoute(route, readProgress());
    if (!block.length) return;

    let cancelled = false;

    (async () => {
      const firstTarget = block[0].target;
      const ready = firstTarget ? await waitForTarget(sel(firstTarget), 5000) : true;
      if (cancelled || !ready) return;

      // driver.js entra por import dinâmico, não no topo do arquivo: este
      // componente mora no layout do admin, então um import estático levaria a
      // lib + o CSS dela pro bundle de TODA página do painel — inclusive com
      // TOUR_ENABLED=false, quando o tour nunca abre. Aqui só baixa quando um
      // tour de verdade vai rodar.
      const [{ driver }] = await Promise.all([
        import('driver.js'),
        // @ts-expect-error -- CSS não tem tipagem; o import é pelo efeito colateral.
        import('driver.js/dist/driver.css'),
      ]);
      if (cancelled) return;

      const last = block[block.length - 1];
      const continues = nextStepAfter(last.id) !== null;

      const d = driver({
        showProgress: true,
        progressText: 'Passo {{current}} de {{total}}',
        nextBtnText: 'Próximo',
        prevBtnText: 'Voltar',
        doneBtnText: continues ? 'Entendi' : 'Concluir',
        overlayOpacity: 0.6,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: 'xbr-tour',
        steps: block.map((s) => ({
          // Sem target: popover sozinho, sem recorte no overlay (a tela de
          // boas-vindas).
          element: s.target ? sel(s.target) : undefined,
          // Alvo condicional é decidido na hora de exibir, não agora: o
          // organizador pode marcar "Sim" numa dimensão enquanto o tour está
          // aberto, e aí o card de gerar classificações passa a existir.
          skipMissingElement: s.optional,
          popover: {
            title: withMascot(s.title),
            description: s.body,
            ...(s.nextBtnText ? { nextBtnText: s.nextBtnText } : {}),
          },
        })),
        onHighlighted: (_el, _step, opts) => {
          const current = block[opts.index ?? 0];
          if (current) writeProgress(current.id);
        },
        // Próximo/Concluir no último passo do bloco: avança pra próxima rota
        // e destrói. Sobrescrever o handler assume a responsabilidade de
        // também chamar moveNext() nos passos que não são o último — senão a
        // lib não anda sozinha.
        onNextClick: (_el, _step, opts) => {
          if (opts.driver.isLastStep()) {
            const next = nextStepAfter(last.id);
            if (next) writeProgress(next.id);
            else clearProgress();
            opts.driver.destroy();
          } else {
            opts.driver.moveNext();
          }
        },
        // Clique no × — dispensa. Precisa de handler próprio: sem ele, driver.js
        // trata o × como um destroy genérico indistinguível de "terminou o
        // último passo", e dismiss() acabava sendo pulado.
        onCloseClick: (_el, _step, opts) => {
          dismiss();
          opts.driver.destroy();
        },
        // Única via que ainda cai aqui é Esc — Próximo/Concluir e × já se
        // resolvem sozinhos acima. driver.destroy() (o do cleanup abaixo, na
        // troca de rota) usa a API pública, que internamente pula este hook
        // de propósito — não precisa de guarda contra reentrância.
        onDestroyStarted: (_el, _step, opts) => {
          dismiss();
          opts.driver.destroy();
        },
      });

      driverRef.current = d;
      d.drive();
    })();

    return () => {
      cancelled = true;
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [pathname, runId]);

  return null;
}
