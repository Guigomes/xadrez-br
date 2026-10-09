import type React from 'react';

// http(s)://… ou www.… — o resto da palavra (até espaço/quebra de linha).
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Pontuação que fecha a frase não faz parte do endereço: "veja https://x.com/a)."
const TRAILING_PUNCT_RE = /[.,;:!?)\]}]+$/;

/**
 * Texto simples em que cada endereço de site vira link clicável (abre em outra
 * aba). Preserva as quebras de linha do texto digitado — descrição de torneio
 * costuma ter um link por linha — e quebra links longos pra não vazar da tela.
 * O texto é sempre renderizado como texto (nunca como HTML), então não há risco
 * de injeção mesmo com conteúdo digitado por qualquer organizador.
 */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_PUNCT_RE, '');
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
      >
        {trimmed}
      </a>,
    );
    // A pontuação cortada volta como texto normal depois do link.
    lastIndex = match.index + trimmed.length;
    URL_RE.lastIndex = lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return <span className={`whitespace-pre-line ${className ?? ''}`}>{parts}</span>;
}
