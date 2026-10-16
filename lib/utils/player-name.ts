/**
 * Nome do jogador conforme quem está vendo. full_name é a ordem em que o nome é lido no
 * Brasil ("Pedro Joaquim Maurer Teodosio"); fide_name, quando a fonte trouxe, é o padrão
 * de cadastro da FIDE ("Teodosio, Pedro Joaquim Maurer"), que é o que o público de fora
 * está acostumado a ver em resultados de xadrez. Visitante em pt-BR vê o primeiro; os
 * demais idiomas veem o segundo. Sem fide_name, todos veem full_name.
 */
export function playerDisplayName(
  fullName: string | null | undefined,
  fideName: string | null | undefined,
  locale: string,
): string {
  if (fideName && locale !== 'pt-BR') return fideName;
  return fullName ?? '';
}
