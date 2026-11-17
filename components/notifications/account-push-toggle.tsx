'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ensurePushSubscription, getExistingPushSubscription, pushSupported } from '@/lib/push-client';

type Status = 'checking' | 'unsupported' | 'anonymous' | 'denied' | 'off' | 'on' | 'saving' | 'error';

interface Props {
  /**
   * `card`: bloco completo com explicação (Minha conta).
   * `button`: só o botão (/alertas, chat do Dev).
   * `prompt`: chamada curta que some quando já está ativo (card de convite).
   */
  variant?: 'card' | 'button' | 'prompt';
  /** Texto da chamada no modo `prompt`. */
  promptText?: string;
}

/**
 * Notificações da CONTA neste aparelho (convite de equipe, alertas de torneio,
 * vaga liberada, respostas do suporte). Diferente do botão da página do
 * torneio (NotifyButton), que só escolhe qual torneio o aparelho acompanha.
 * Ligar/desligar aqui não mexe no torneio seguido (ver /api/push/account).
 */
export function AccountPushToggle({ variant = 'card', promptText }: Props) {
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) { setStatus('unsupported'); return; }
      if (Notification.permission === 'denied') { setStatus('denied'); return; }
      const sub = await getExistingPushSubscription().catch(() => null);
      if (!sub) { if (!cancelled) setStatus('off'); return; }
      const res = await fetch('/api/push/account/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => null);
      if (cancelled) return;
      if (res?.status === 401) { setStatus('anonymous'); return; }
      const json = await res?.json().catch(() => null);
      setStatus(json?.linked ? 'on' : 'off');
    })();
    return () => { cancelled = true; };
  }, []);

  async function turnOn() {
    setError('');
    setStatus('saving');
    try {
      const sub = await ensurePushSubscription();
      const res = await fetch('/api/push/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (res.status === 401) { setStatus('anonymous'); return; }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Não foi possível ativar.');
      setStatus('on');
    } catch (err) {
      if (err instanceof Error && err.message === 'DENIED') { setStatus('denied'); return; }
      console.error('[AccountPushToggle]', err);
      setError(err instanceof Error ? err.message : 'Não foi possível ativar.');
      setStatus('error');
    }
  }

  async function turnOff() {
    setError('');
    setStatus('saving');
    try {
      const sub = await getExistingPushSubscription();
      if (sub) {
        const res = await fetch('/api/push/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Não foi possível desativar.');
        const { kept } = await res.json();
        // Aparelho que segue um torneio continua inscrito para os avisos dele.
        if (!kept) await sub.unsubscribe();
      }
      setStatus('off');
    } catch (err) {
      console.error('[AccountPushToggle]', err);
      setError(err instanceof Error ? err.message : 'Não foi possível desativar.');
      setStatus('error');
    }
  }

  // Visitante sem conta não tem avisos de conta; navegador sem push não tem o que ligar.
  if (status === 'checking' || status === 'anonymous') return null;
  if (variant === 'prompt' && (status === 'on' || status === 'unsupported')) return null;

  const isOn = status === 'on';
  const busy = status === 'saving';
  const action = (
    <Button
      size="sm"
      variant={isOn ? 'secondary' : 'primary'}
      loading={busy}
      disabled={busy || status === 'denied' || status === 'unsupported'}
      onClick={isOn ? turnOff : turnOn}
    >
      {isOn ? 'Desativar neste aparelho' : 'Ativar neste aparelho'}
    </Button>
  );
  const help =
    status === 'denied' ? 'O navegador está bloqueando notificações deste site. Libere nas configurações do navegador e recarregue a página.'
    : status === 'unsupported' ? 'Este navegador não recebe notificações. No iPhone, adicione o site à Tela de Início e abra por lá.'
    : null;

  if (variant === 'prompt') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <span>🔔 {promptText ?? 'Ative as notificações neste aparelho para receber os próximos avisos.'}</span>
        {action}
        {help && <span className="w-full">{help}</span>}
        {error && <span className="w-full text-red-600 dark:text-red-400">{error}</span>}
      </div>
    );
  }

  if (variant === 'button') {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          {action}
          {isOn && <span className="text-xs font-medium text-green-700 dark:text-green-400">🔔 Ativas neste aparelho</span>}
        </div>
        {help && <p className="text-xs text-gray-500 dark:text-gray-400">{help}</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Notificações neste aparelho</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Avisos da sua conta: convites para a equipe de um torneio, alertas de torneios novos,
            vaga liberada na lista de espera e respostas do suporte.
          </p>
        </div>
        {isOn && <span className="shrink-0 text-xs font-medium text-green-700 dark:text-green-400">🔔 Ativas</span>}
      </div>
      {action}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Vale só para este celular ou computador. Para acompanhar as rodadas de um torneio,
        use o botão &quot;Avisar sobre este torneio&quot; na página dele.
      </p>
      {help && <p className="text-xs text-amber-700 dark:text-amber-400">{help}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
