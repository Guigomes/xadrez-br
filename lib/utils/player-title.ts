/**
 * Título do jogador como exibido no idioma do site (pedido do dono, 2026-10-28): o Mestre Nacional
 * é "MN" em português e "NM" nos demais idiomas. O banco guarda sempre a sigla internacional (NM,
 * WNM, CNM…, como vem da CBX/chess-results); a troca é só na hora de mostrar. Os outros títulos
 * não mudam de sigla.
 */
export function localizedTitle(title: string | null | undefined, locale: string): string | null {
  if (!title) return null;
  return title === 'NM' && locale.toLowerCase().startsWith('pt') ? 'MN' : title;
}
