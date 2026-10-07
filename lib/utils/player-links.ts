/** Perfil público do jogador na FIDE. */
export function fideProfileUrl(fideId: string | number): string {
  return `https://ratings.fide.com/profile/${encodeURIComponent(String(fideId))}`;
}

/** Perfil do jogador na CBX (mesma URL que o cbx-rating usa pra buscar o rating). */
export function cbxProfileUrl(cbxId: string | number): string {
  return `https://cbx.org.br/jogador/${encodeURIComponent(String(cbxId))}`;
}
