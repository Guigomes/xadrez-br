'use client';

import { useEffect, useRef, useState } from 'react';
import { useSignInWithGoogleIdToken } from '@/lib/hooks/use-auth';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        nonce: string;
        use_fedcm_for_prompt?: boolean;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window { google?: GoogleIdentity }
}

function loadGis(): Promise<GoogleIdentity> {
  return new Promise((resolve, reject) => {
    if (window.google) return resolve(window.google);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? Object.assign(document.createElement('script'), { src: GIS_SRC, async: true });
    script.addEventListener('load', () => (window.google ? resolve(window.google) : reject(new Error('gis'))));
    script.addEventListener('error', () => reject(new Error('gis')));
    if (!existing) document.head.appendChild(script);
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Botão oficial "Fazer login com o Google". Mostra o nome do site na escolha de
 * conta (em vez do endereço do Supabase). `onSuccess` roda depois que o Supabase
 * aceitou o token; `onUnavailable` avisa quando o botão não dá pra usar (sem
 * client id, script bloqueado, origem não autorizada) pra tela oferecer o fluxo
 * antigo por redirecionamento.
 */
export function GoogleSignInButton({
  onSuccess, onError, onUnavailable,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const signIn = useSignInWithGoogleIdToken();
  // Callbacks via ref: o botão é inicializado uma vez, e os handlers da tela mudam a cada render.
  const handlers = useRef({ onSuccess, onError, onUnavailable, signIn });
  handlers.current = { onSuccess, onError, onUnavailable, signIn };

  useEffect(() => {
    if (!CLIENT_ID) { handlers.current.onUnavailable(); return; }
    let cancelled = false;

    (async () => {
      try {
        const google = await loadGis();
        if (cancelled || !container.current) return;
        const rawNonce = crypto.randomUUID();
        const hashedNonce = await sha256Hex(rawNonce);
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          nonce: hashedNonce,
          callback: async ({ credential }) => {
            if (!credential) return handlers.current.onError('Não foi possível entrar com o Google. Tente de novo.');
            try {
              await handlers.current.signIn.mutateAsync({ token: credential, nonce: rawNonce });
              handlers.current.onSuccess();
            } catch (err) {
              handlers.current.onError(err instanceof Error ? err.message : 'Erro ao entrar com o Google.');
            }
          },
        });
        google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          locale: 'pt-BR',
          width: Math.min(container.current.clientWidth || 280, 400),
        });
        setReady(true);
      } catch {
        if (!cancelled) handlers.current.onUnavailable();
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex min-h-11 justify-center">
      <div ref={container} className={`w-full ${ready ? '' : 'invisible'}`} />
    </div>
  );
}
