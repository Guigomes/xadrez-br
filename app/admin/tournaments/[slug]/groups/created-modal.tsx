'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

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
  const [show, setShow] = useState(searchParams.get('criado') === '1');

  function dismiss() {
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
      <Button onClick={dismiss} className="w-full">Entendi</Button>
    </Modal>
  );
}
