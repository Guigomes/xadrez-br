'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { driver, type Driver } from 'driver.js';
// CSS de node_modules pode ser importado fora do layout raiz. Fica aqui, junto
// de quem usa; os ajustes de tema estão em app/globals.css (.xbr-tour).
import 'driver.js/dist/driver.css';
import { matchRoute, stepsForRoute, nextStepAfter } from '@/lib/tour/steps';
import {
  readProgress,
  writeProgress,
  clearProgress,
  dismiss,
  TOUR_START_EVENT,
} from '@/lib/tour/state';

const sel = (target: string) => `[data-tour="${target}"]`;

/**
 * Espera o alvo existir no DOM.
 *
 * Necessário porque /groups e /players renderizam <PageSpinner /> enquanto o
 * React Query resolve — montar o spotlight antes disso ancoraria em nada. Em
 * /groups há um agravante: um window.scrollTo(0,0) dispara quando o conteúdo
 * termina de montar (ver o comentário em groups/page.tsx), e o recorte do
 * overlay ficaria desalinhado se o tour começasse antes.
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
  const teardownRef = useRef(false);

  useEffect(() => {
    const route = matchRoute(pathname);
    if (!route) return;

    const block = stepsForRoute(route, readProgress());
    if (!block.length) return;

    let cancelled = false;

    (async () => {
      const ready = await waitForTarget(sel(block[0].target), 5000);
      if (cancelled || !ready) return;

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
          element: sel(s.target),
          // Alvo condicional é decidido na hora de exibir, não agora: o
          // organizador pode marcar "Sim" numa dimensão enquanto o tour está
          // aberto, e aí o card de gerar classificações passa a existir.
          skipMissingElement: s.optional,
          popover: { title: s.title, description: s.body },
        })),
        onHighlighted: (_el, _step, opts) => {
          const current = block[opts.index ?? 0];
          if (current) writeProgress(current.id);
        },
        // Só é chamado quando quem fecha é o organizador — driver.destroy()
        // (o do cleanup abaixo) não passa por aqui. O teardownRef é defesa
        // caso isso mude numa versão futura da lib.
        onDestroyStarted: (_el, _step, opts) => {
          if (teardownRef.current) {
            opts.driver.destroy();
            return;
          }
          if (opts.driver.hasNextStep()) {
            // Saiu no meio — tratamos como "não quero isso".
            dismiss();
          } else {
            const next = nextStepAfter(last.id);
            if (next) writeProgress(next.id);
            else clearProgress();
          }
          opts.driver.destroy();
        },
      });

      driverRef.current = d;
      d.drive();
    })();

    return () => {
      cancelled = true;
      teardownRef.current = true;
      driverRef.current?.destroy();
      driverRef.current = null;
      teardownRef.current = false;
    };
  }, [pathname, runId]);

  return null;
}
