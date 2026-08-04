'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { readProgress } from '@/lib/tour/state';

// Mesmo padrão de lib/tour/state.ts: preferência ("não quero ver isso de
// novo") em localStorage, não expira ao fechar a aba. Guarda de
// `typeof window` + try/catch porque storage lança em modo privado de
// alguns navegadores.
const DISMISSED_KEY = 'xbr_criado_modal_dispensado';

function isPermanentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function dismissPermanently() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    /* storage indisponível — só não persiste, modal volta a aparecer */
  }
}

/**
 * ?criado=1 só vem do redirect logo após "Criar torneio" (app/admin/
 * tournaments/new/page.tsx) — pousa direto na aba Emparceiramento porque é a
 * única decisão que falta antes de publicar. Limpa da URL ao fechar pra não
 * reabrir num refresh.
 */
export function CreatedModal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Com o tour em andamento, ele já explica esta tela no passo "Quem joga
  // contra quem" — e os dois juntos não só repetem o recado como brigam: o
  // overlay do driver.js fica por cima e intercepta o clique no "Entendi"
  // daqui, deixando o modal impossível de fechar.
  const [show, setShow] = useState(
    searchParams.get('criado') === '1' && !isPermanentlyDismissed() && readProgress() === null,
  );
  const [dontShowAgain, setDontShowAgain] = useState(false);

  function dismiss() {
    if (dontShowAgain) dismissPermanently();
    setShow(false);
    router.replace(pathname);
  }

  if (!show) return null;

  return (
    <Modal title="Torneio criado! 🎉" onClose={dismiss}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Falta só decidir o emparceiramento (quem joga contra quem) aqui embaixo pra poder
        publicar. Enquanto o torneio estiver em rascunho, ninguém além de você consegue vê-lo —
        ele só fica visível pro público depois de publicado.
      </p>
      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-gray-600 dark:text-gray-400">Não mostrar esta mensagem novamente</span>
      </label>
      <Button onClick={dismiss} className="w-full">Entendi</Button>
    </Modal>
  );
}
