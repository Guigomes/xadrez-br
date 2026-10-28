/** Resposta de GET /api/players/cbx-lookup?id= — dados para preencher um formulário de jogador. */
export interface CbxLookupResult {
  /** De onde vieram os dados: cadastro já existente no Gambito ou perfil público da CBX. */
  source: 'gambito' | 'cbx';
  full_name: string;
  birth_year: number | null;
  sex: 'm' | 'w' | null;
  city: string | null;
  state: string | null;
  club_or_school: string | null;
  federation: string | null;
  fide_id: string | null;
}
