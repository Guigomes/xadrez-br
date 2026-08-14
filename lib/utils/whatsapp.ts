import { formatScore } from './chess';

/**
 * Monta o texto de divulgação (classificação/rodada) e abre o WhatsApp com ele
 * já preenchido. `wa.me/?text=` sem número abre o seletor de conversa — o
 * organizador escolhe o grupo e só envia. É o único jeito de "compartilhar no
 * zap" sem integração: nenhuma API, nenhum número gravado.
 *
 * O texto é uma lista simples ("N. Nome — pts", uma linha por jogador), não
 * colunas: WhatsApp usa fonte proporcional e não respeita alinhamento por
 * espaço, então tabela viraria bagunça em muitos aparelhos.
 */

// Acima disso a mensagem fica ilegível de tão longa — corta e avisa quantos
// sobraram. WhatsApp aceita ~65k chars, mas o problema aqui é leitura, não limite.
const MAX_LINES = 80;

function truncateLines(lines: string[]): string[] {
  if (lines.length <= MAX_LINES) return lines;
  const kept = lines.slice(0, MAX_LINES);
  kept.push(`… e mais ${lines.length - MAX_LINES}`);
  return kept;
}

export interface StandingsMessageRow {
  rank: number | null;
  full_name: string;
  points: number;
}

export function buildStandingsMessage(opts: {
  tournamentName: string;
  heading: string;
  roundLabel?: string | null;
  rows: StandingsMessageRow[];
  url?: string;
}): string {
  const head = [`🏆 ${opts.tournamentName}`, `📊 Classificação — ${opts.heading}`];
  if (opts.roundLabel) head.push(opts.roundLabel);

  const body = truncateLines(
    opts.rows.map((r, i) => {
      const pos = r.rank ?? i + 1;
      return `${pos}. ${r.full_name} — ${formatScore(r.points)} pts`;
    })
  );

  const parts = [head.join('\n'), body.join('\n')];
  if (opts.url) parts.push(opts.url);
  return parts.join('\n\n');
}

export interface RoundMessagePairing {
  board_number: number | null;
  white_name: string;
  black_name: string;
  result: string;
  is_bye: boolean;
  white_points?: number | null;
}

export function buildRoundMessage(opts: {
  tournamentName: string;
  roundNumber: number;
  groupName?: string | null;
  statusLabel: string;
  resultLabels: Record<string, string>;
  pairings: RoundMessagePairing[];
  url?: string;
}): string {
  const titulo = `♟ Rodada ${opts.roundNumber}${opts.groupName ? ` — ${opts.groupName}` : ''} · ${opts.statusLabel}`;
  const head = [`🏁 ${opts.tournamentName}`, titulo];

  // Byes num torneio grande são vários — juntar numa linha só no fim é mais
  // limpo que espalhar "Mesa —: Fulano (bye)" no meio dos confrontos.
  const jogos = opts.pairings.filter((p) => !p.is_bye);
  const byes = opts.pairings.filter((p) => p.is_bye);

  const lines = jogos.map((p) => {
    const mesa = p.board_number != null ? `Mesa ${p.board_number}: ` : '';
    const res = opts.resultLabels[p.result] ?? p.result;
    return `${mesa}${p.white_name} × ${p.black_name} — ${res}`;
  });

  const body = truncateLines(lines);
  if (byes.length > 0) {
    body.push(`Bye: ${byes.map((p) => p.white_name).join(', ')}`);
  }

  const parts = [head.join('\n'), body.join('\n')];
  if (opts.url) parts.push(opts.url);
  return parts.join('\n\n');
}

export function openWhatsApp(text: string): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}
