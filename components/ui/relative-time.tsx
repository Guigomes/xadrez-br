'use client';

import { useEffect, useState } from 'react';

interface Props {
  iso: string;
  className?: string;
}

export function relativeTimeLabel(iso: string, now: number): string {
  const diffMin = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffMin < 120) return 'há 1 hora';
  if (diffMin < 1440) return `há ${Math.floor(diffMin / 60)} horas`;
  if (diffMin < 2880) return 'há 1 dia';
  return `há ${Math.floor(diffMin / 1440)} dias`;
}

/**
 * "há 5 min", "há 2 horas"... O texto depende do relógio, então o do servidor quase
 * nunca é igual ao do navegador na hidratação (basta virar o minuto, ou o relógio do
 * celular estar adiantado). Sem `suppressHydrationWarning` isso vira o erro #418 do
 * React, que abandona a hidratação do layout do torneio inteiro: a aba de rodada fica
 * no spinner para sempre e nenhum componente cliente da página funciona.
 * Depois de montar, recalcula com o relógio local e atualiza a cada minuto.
 */
export function RelativeTime({ iso, className }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString('pt-BR')} className={className} suppressHydrationWarning>
      {relativeTimeLabel(iso, now)}
    </time>
  );
}
