/**
 * Versão incorporável de um link de transmissão do Lichess, ou null quando o link não é
 * uma transmissão do Lichess. A página normal (/broadcast/...) manda X-Frame-Options: DENY
 * e não abre dentro de outro site; a de incorporação (/embed/broadcast/...) abre.
 *
 * Só o Lichess vira iframe: o link é digitado pelo organizador, e embutir qualquer site
 * dentro do nosso seria abrir espaço pra página enganosa com a nossa marca em volta.
 * Outros serviços continuam disponíveis pelo botão "abrir em nova aba".
 */
export function lichessBroadcastEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== 'lichess.org' && parsed.hostname !== 'www.lichess.org') return null;

  // /broadcast/{torneio}/{rodada}/{id} — ou já /embed/broadcast/...
  const path = parsed.pathname.replace(/\/+$/, '');
  const m = path.match(/^\/(?:embed\/)?broadcast\/([\w-]+)(?:\/([\w-]+))?(?:\/([\w-]+))?$/);
  if (!m) return null;
  const parts = m.slice(1).filter(Boolean).join('/');
  return `https://lichess.org/embed/broadcast/${parts}`;
}
