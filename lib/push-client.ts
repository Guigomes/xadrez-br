'use client';

/**
 * Push no navegador, comum aos dois botões:
 *  - NotifyButton (página do torneio): o aparelho segue UM torneio;
 *  - AccountPushToggle (Minha conta, /alertas, Painel): o aparelho recebe os
 *    avisos da CONTA (convite de equipe, alertas, vaga liberada, suporte).
 *
 * Os dois usam a mesma inscrição do navegador (uma por aparelho) e a mesma
 * linha de push_subscriptions (chave: endpoint), com tournament_id e user_id
 * independentes. Desligar um não pode desligar o outro: quem decide se a
 * inscrição do navegador pode ser cancelada é o servidor (resposta `kept`).
 */

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// Registers /push-sw.js (minimal, no workbox) and waits for it to activate.
async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/push-sw.js');

  // If already active (e.g. returning visit), return immediately
  if (reg.active) return reg;

  // Wait for activation with proper statechange handling
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Service worker não ativou. Recarregue a página e tente novamente.')),
      15000
    );
    const done = (ok: boolean, msg?: string) => {
      clearTimeout(timer);
      if (ok) resolve(reg);
      else reject(new Error(msg ?? 'Service worker falhou ao instalar.'));
    };
    const watch = (sw: ServiceWorker) => {
      // Check current state before adding listener (handles fast activation)
      if (sw.state === 'activated') return done(true);
      if (sw.state === 'redundant') return done(false);
      sw.addEventListener('statechange', function h() {
        if (sw.state === 'activated') { sw.removeEventListener('statechange', h); done(true); }
        else if (sw.state === 'redundant') { sw.removeEventListener('statechange', h); done(false); }
      });
    };
    if (reg.installing) watch(reg.installing);
    else if (reg.waiting) watch(reg.waiting);
    else done(false, 'Service worker não encontrado.');
  });
}

/** Inscrição atual do aparelho, sem pedir permissão nem criar nada. */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * Pede permissão e devolve a inscrição do aparelho (a existente, se houver).
 * Lança 'DENIED' quando a pessoa (ou o navegador) recusa.
 */
export async function ensurePushSubscription(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('DENIED');

  const reg = await getPushRegistration();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error('VAPID key não configurada');

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    // lib.dom tornou TypedArray genérico sobre o buffer (TS 5.7+):
    // Uint8Array<ArrayBufferLike> não satisfaz BufferSource
    // (ArrayBufferView<ArrayBuffer>) mesmo sendo o mesmo dado em runtime.
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  });
}
