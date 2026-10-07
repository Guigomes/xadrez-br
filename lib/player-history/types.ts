// Histórico do jogador: linhas de get_player_history (torneios ao vivo/importados + arquivo)
// convertidas para o formato da tela validada no Minhas Partidas.

export type HistoryResult = '1-0' | '0-1' | '1/2-1/2' | 'forfeit_white' | 'forfeit_black' | 'double_forfeit';

/** Linha devolvida pela função get_player_history (só usuário logado). */
export interface HistoryRow {
  source: 'live' | 'history';
  game_id: string;
  tournament_id: string;
  tournament_slug: string;
  tournament_name: string;
  start_date: string;
  time_control_kind: 'bullet' | 'blitz' | 'rapid' | 'classical' | 'other';
  homologated: boolean | null;
  group_name: string | null;
  round_number: number;
  color: 'white' | 'black';
  opponent_player_id: string | null;
  opponent_name: string;
  opponent_title: string | null;
  opponent_cbx_id: string | null;
  opponent_rating: number | null;
  result: HistoryResult | string;
  points: number | null;
  has_pgn: boolean;
}

// Resultado do ponto de vista do jogador da página.
export type Outcome = 'win' | 'loss' | 'draw' | 'forfeit_win' | 'forfeit_loss' | 'double_forfeit';

export interface HGame {
  id: string;
  source: 'live' | 'history';
  tournamentId: string;
  tournamentSlug: string;
  tournamentName: string;
  /** Início do torneio (a base antiga só guarda a data do torneio, não a de cada rodada). */
  date: string;
  timeControl: string | null;
  homologated: boolean | null;
  groupName: string | null;
  round: number;
  color: 'white' | 'black';
  whiteName: string;
  blackName: string;
  outcome: Outcome;
  /** resultado como está no banco (1-0, 0-1, 1/2-1/2, forfeit_*) */
  result: string;
  hasPgn: boolean;
  opp: { key: string; id: string | null; name: string; cbxId: string | null; rating: number | null; title: string | null };
}

const KIND_LABEL: Record<string, string | null> = {
  classical: 'Clássico',
  rapid: 'Rápido',
  blitz: 'Blitz',
  bullet: 'Bullet',
  other: null,
};

export function outcomeOf(result: string, color: 'white' | 'black'): Outcome {
  const white = color === 'white';
  switch (result) {
    case '1-0':
      return white ? 'win' : 'loss';
    case '0-1':
      return white ? 'loss' : 'win';
    case '1/2-1/2':
      return 'draw';
    case 'forfeit_black': // pretas não compareceram: brancas ganham
      return white ? 'forfeit_win' : 'forfeit_loss';
    case 'forfeit_white':
      return white ? 'forfeit_loss' : 'forfeit_win';
    default:
      return 'double_forfeit';
  }
}

/** W.O. não é partida jogada: fica fora das estatísticas e do confronto direto. */
export function wasPlayed(g: HGame): boolean {
  return g.outcome === 'win' || g.outcome === 'loss' || g.outcome === 'draw';
}

export function toGames(rows: HistoryRow[], myName: string): HGame[] {
  return rows
    // bye, não emparceirado e mesa sem resultado não são partidas do jogador
    .filter((r) => ['1-0', '0-1', '1/2-1/2', 'forfeit_white', 'forfeit_black', 'double_forfeit'].includes(r.result))
    .map((r) => ({
      id: `${r.source}:${r.game_id}`,
      source: r.source,
      tournamentId: r.tournament_id,
      tournamentSlug: r.tournament_slug,
      tournamentName: r.tournament_name,
      date: r.start_date,
      timeControl: KIND_LABEL[r.time_control_kind] ?? null,
      homologated: r.homologated,
      groupName: r.group_name,
      round: r.round_number,
      color: r.color,
      whiteName: r.color === 'white' ? myName : r.opponent_name,
      blackName: r.color === 'white' ? r.opponent_name : myName,
      outcome: outcomeOf(r.result, r.color),
      result: r.result,
      hasPgn: r.has_pgn,
      opp: {
        key: r.opponent_player_id ?? `nome:${r.opponent_name}`,
        id: r.opponent_player_id,
        name: r.opponent_name,
        cbxId: r.opponent_cbx_id,
        rating: r.opponent_rating,
        title: r.opponent_title,
      },
    }));
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  win: 'Vitória',
  loss: 'Derrota',
  draw: 'Empate',
  forfeit_win: 'Vitória (W.O.)',
  forfeit_loss: 'Derrota (W.O.)',
  double_forfeit: 'W.O. duplo',
};

export const OUTCOME_CLASS: Record<Outcome, string> = {
  win: 'text-brand-600 dark:text-brand-400',
  loss: 'text-red-600 dark:text-red-400',
  draw: 'text-gray-600 dark:text-gray-300',
  forfeit_win: 'text-gray-500 dark:text-gray-400',
  forfeit_loss: 'text-gray-500 dark:text-gray-400',
  double_forfeit: 'text-gray-500 dark:text-gray-400',
};

/** Link da tela do torneio: ao vivo/importado tem a página completa; arquivo tem a página histórica. */
export function tournamentHref(g: Pick<HGame, 'source' | 'tournamentSlug'>): string {
  return g.source === 'live' ? `/torneios/${g.tournamentSlug}` : `/historico/${g.tournamentSlug}`;
}

export function numberLabel(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
