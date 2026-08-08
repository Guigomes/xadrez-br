import type { GameResult, TournamentStatus, RoundStatus, TournamentType, RatingKind } from '@/types/database';

// ============================================================
// Game result helpers
// ============================================================

/** Quem ganhou/perdeu/empatou um lado específico — cobre bye e WO (forfeit), não só 1-0/0-1. */
export function winnerSide(result: GameResult, side: 'white' | 'black'): 'winner' | 'loser' | 'draw' | 'pending' {
  if (result === '*') return 'pending';
  if (result === '1/2-1/2') return 'draw';
  if (result === 'bye') return side === 'white' ? 'winner' : 'pending';
  if (result === '1-0') return side === 'white' ? 'winner' : 'loser';
  if (result === '0-1') return side === 'black' ? 'winner' : 'loser';
  if (result === 'forfeit_white') return side === 'black' ? 'winner' : 'loser';
  if (result === 'forfeit_black') return side === 'white' ? 'winner' : 'loser';
  if (result === 'double_forfeit') return 'loser';
  return 'pending';
}

export function resultLabel(result: GameResult, forWhite: boolean): string {
  switch (result) {
    case '1-0':       return forWhite ? 'Vitória' : 'Derrota';
    case '0-1':       return forWhite ? 'Derrota' : 'Vitória';
    case '1/2-1/2':  return 'Empate';
    case 'bye':       return 'BYE';
    case 'forfeit_white': return forWhite ? 'WO' : 'WO adversário';
    case 'forfeit_black': return forWhite ? 'WO adversário' : 'WO';
    case 'double_forfeit': return 'Duplo WO';
    case '*':         return 'Em andamento';
    default:          return '–';
  }
}

export function resultScore(result: GameResult, forWhite: boolean): string {
  switch (result) {
    case '1-0':       return forWhite ? '1' : '0';
    case '0-1':       return forWhite ? '0' : '1';
    case '1/2-1/2':  return '½';
    case 'bye':       return '1';
    case '*':         return '–';
    default:          return '–';
  }
}

export function resultBadgeColor(result: GameResult, forWhite: boolean): string {
  if (result === '*') return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  if (result === '1/2-1/2') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  if (result === 'bye') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  const isWin = (result === '1-0' && forWhite) || (result === '0-1' && !forWhite);
  return isWin
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
}

// ============================================================
// Tournament status helpers
// ============================================================

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  draft:                'Rascunho',
  published:            'Publicado',
  registration:         'Inscrições abertas',
  registration_closed:  'Inscrições encerradas',
  ongoing:              'Em andamento',
  finished:             'Encerrado',
  cancelled:             'Cancelado',
};

export const TOURNAMENT_STATUS_COLORS: Record<TournamentStatus, string> = {
  draft:                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  published:            'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  registration:         'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  registration_closed:  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ongoing:              'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  // purple-100 é visualmente quase branco (lightness alta demais pra esse
  // hue) — some contra o fundo do card ao lado de gray-100/green-100 nos
  // outros badges. purple-200 mantém a paleta mas com peso visual igual.
  finished:             'bg-purple-200 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200',
  cancelled:            'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

// Mesmas opções de components/tournament/tournament-form.tsx (Sistema /
// Rating para seed) — extraídas pra cá pra reuso na página pública do
// torneio (visão geral de regras).
export const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  swiss:       'Suíço',
  round_robin: 'Todos contra todos',
  knockout:    'Eliminatório',
  other:       'Outro',
};

export const RATING_KIND_LABELS: Record<RatingKind, string> = {
  std: 'Clássico',
  rpd: 'Rápido',
  blz: 'Blitz',
};

export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * 'registration_closed' já é status real no banco (migration 038), mas isso
 * sozinho depende do organizador clicar "Avançar" depois do prazo. Enquanto
 * isso não acontece, o selo continua mostrando "encerrada" só de olhar a
 * data — a RLS de inscrição já bloqueia o envio por data de qualquer forma,
 * então isso aqui é cosmético/defensivo, não duplica segurança.
 */
export function isRegistrationClosed(
  status: TournamentStatus,
  registrationEndDate: string | null | undefined,
): boolean {
  if (status === 'registration_closed') return true;
  if (status !== 'registration' || !registrationEndDate) return false;
  return registrationEndDate < todayInSaoPaulo();
}

export function getTournamentStatusLabel(
  status: TournamentStatus,
  registrationEndDate: string | null | undefined,
): string {
  if (isRegistrationClosed(status, registrationEndDate)) return TOURNAMENT_STATUS_LABELS.registration_closed;
  return TOURNAMENT_STATUS_LABELS[status];
}

export function getTournamentStatusColor(
  status: TournamentStatus,
  registrationEndDate: string | null | undefined,
): string {
  if (isRegistrationClosed(status, registrationEndDate)) return TOURNAMENT_STATUS_COLORS.registration_closed;
  return TOURNAMENT_STATUS_COLORS[status];
}

// ============================================================
// Round status helpers
// ============================================================

export const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
  draft:    'Rascunho',
  pending:  'Aguardando',
  ongoing:  'Em andamento',
  finished: 'Finalizada',
};

export const ROUND_STATUS_COLORS: Record<RoundStatus, string> = {
  draft:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  pending:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  ongoing:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  finished: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

// ============================================================
// Tiebreak explanations (pt-BR)
// ============================================================

export const TIEBREAK_INFO = {
  buchholz: {
    label: 'Buchholz',
    short: 'BH',
    description:
      'Soma dos pontos de todos os adversários. Mede a força dos adversários enfrentados.',
  },
  buchholz_cut1: {
    label: 'Buchholz Corte 1',
    short: 'BH-1',
    description:
      'Buchholz sem o adversário com menor pontuação. Reduz o impacto de adversários muito fracos.',
  },
  sonneborn_berger: {
    label: 'Sonneborn-Berger',
    short: 'SB',
    description:
      'Soma dos pontos dos adversários derrotados + metade dos pontos dos adversários empatados. Premia vitórias contra adversários fortes.',
  },
  wins: {
    label: 'Número de vitórias',
    short: 'Vit',
    description:
      'Quantidade total de partidas vencidas. Premia quem venceu mais jogos, independente do adversário.',
  },
  progressive: {
    label: 'Progressivo',
    short: 'Prog',
    description:
      'Soma da pontuação acumulada rodada a rodada. Premia quem pontuou cedo no torneio (boa campanha do início ao fim).',
  },
  direct_encounter: {
    label: 'Confronto Direto',
    short: 'CD',
    description:
      'Resultado do confronto direto entre os jogadores empatados em pontos.',
  },
  performance_rating: {
    label: 'Desempenho',
    short: 'Perf',
    description:
      'Rating de performance calculado com base nos adversários e resultados do torneio.',
  },
};

// ============================================================
// Format helpers
// ============================================================

/**
 * Ordem de exibição de participantes: por initial_ranking (seed) quando já
 * foi gerado; enquanto não foi (todos null), cai numa ordem natural por
 * rating (maior primeiro) e nome — em vez da ordem crua do banco, que não
 * significa nada pro organizador antes do seed existir.
 */
export function compareParticipantOrder(
  a: { initial_ranking: number | null; player?: { rating_std?: number | null; full_name?: string | null } | null },
  b: { initial_ranking: number | null; player?: { rating_std?: number | null; full_name?: string | null } | null },
): number {
  if (a.initial_ranking != null && b.initial_ranking != null) return a.initial_ranking - b.initial_ranking;
  if (a.initial_ranking != null) return -1;
  if (b.initial_ranking != null) return 1;
  const ratingA = a.player?.rating_std ?? -1;
  const ratingB = b.player?.rating_std ?? -1;
  if (ratingA !== ratingB) return ratingB - ratingA;
  return (a.player?.full_name ?? '').localeCompare(b.player?.full_name ?? '');
}

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '–';
  if (score % 1 === 0.5) return `${Math.floor(score)}½`;
  return score.toString();
}

export function formatRating(rating: number | null | undefined): string {
  if (!rating) return 'sem rating';
  return rating.toString();
}

export function formatTiebreak(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return value.toFixed(1);
}

/**
 * Ordena grupos de emparceiramento pelo número embutido no nome (SUB7 < SUB9 <
 * SUB11…), caindo pra alfabético quando não há número. Extraído porque a mesma
 * comparação estava duplicada na visão geral, nos participantes e na
 * classificação — mudar o critério num lugar só passa a valer em todos.
 */
export function compareGroupNames(a: string, b: string): number {
  const nA = parseInt(a.match(/\d+/)?.[0] ?? '999', 10);
  const nB = parseInt(b.match(/\d+/)?.[0] ?? '999', 10);
  return nA !== nB ? nA - nB : a.localeCompare(b);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ============================================================
// Brazilian states
// ============================================================

export const BR_STATES = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
];
