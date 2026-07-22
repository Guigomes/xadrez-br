import type { GameResult, TournamentStatus, RoundStatus } from '@/types/database';

// ============================================================
// Game result helpers
// ============================================================

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
  draft:        'Rascunho',
  registration: 'Inscrições abertas',
  ongoing:      'Em andamento',
  finished:     'Encerrado',
  cancelled:    'Cancelado',
};

export const TOURNAMENT_STATUS_COLORS: Record<TournamentStatus, string> = {
  draft:        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  registration: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ongoing:      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  // purple-100 é visualmente quase branco (lightness alta demais pra esse
  // hue) — some contra o fundo do card ao lado de gray-100/green-100 nos
  // outros badges. purple-200 mantém a paleta mas com peso visual igual.
  finished:     'bg-purple-200 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200',
  cancelled:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const REGISTRATION_CLOSED_LABEL = 'Inscrições encerradas';
const REGISTRATION_CLOSED_COLOR =
  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function isRegistrationClosed(
  status: TournamentStatus,
  registrationEndDate: string | null | undefined,
): boolean {
  if (status !== 'registration' || !registrationEndDate) return false;
  return registrationEndDate < todayInSaoPaulo();
}

export function getTournamentStatusLabel(
  status: TournamentStatus,
  registrationEndDate: string | null | undefined,
): string {
  if (isRegistrationClosed(status, registrationEndDate)) return REGISTRATION_CLOSED_LABEL;
  return TOURNAMENT_STATUS_LABELS[status];
}

export function getTournamentStatusColor(
  status: TournamentStatus,
  registrationEndDate: string | null | undefined,
): string {
  if (isRegistrationClosed(status, registrationEndDate)) return REGISTRATION_CLOSED_COLOR;
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
