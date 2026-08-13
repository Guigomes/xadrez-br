import type { RoundStatus } from '@/types/database';

/**
 * Agregação de rodada por número — fonte única. Um torneio multi-grupo tem
 * UMA linha em `rounds` por (round_number × pairing_group) (migration 007),
 * então "a rodada 3" na verdade são N linhas, uma por grupo. Estas funções
 * colapsam isso num único status/resumo por número de rodada.
 *
 * Antes essa lógica vivia duplicada em app/tournaments/[slug]/rounds/page.tsx
 * e app/tournaments/[slug]/standings/page.tsx; a ferramenta do Gambito
 * (lib/chat/tools.ts) precisava da mesma coisa, então virou helper.
 *
 * `draft` é DELIBERADAMENTE excluído do resumo (summarizeRounds) — rascunho é
 * visível pro organizador via RLS, mas não é "rodada que já aconteceu"; a
 * contagem de rascunhos volta à parte pra quem precisar dela.
 */
export type AggregatableRoundStatus = 'pending' | 'ongoing' | 'finished';

/** finished só se TODOS os grupos terminaram; ongoing se ALGUM está em jogo; senão pending. */
export function aggregateRoundStatus(statuses: AggregatableRoundStatus[]): AggregatableRoundStatus {
  if (statuses.length === 0) return 'pending';
  if (statuses.every((s) => s === 'finished')) return 'finished';
  if (statuses.some((s) => s === 'ongoing')) return 'ongoing';
  return 'pending';
}

export interface RoundSummary {
  roundNumber: number;
  status: AggregatableRoundStatus;
  /** Mais antigo published_at entre os grupos daquele número (null se nenhum publicado). */
  publishedAt: string | null;
  /** Quantas linhas (grupos) esse número de rodada tem. */
  groupCount: number;
}

interface RoundRow {
  round_number: number;
  status: RoundStatus;
  published_at?: string | null;
}

export interface RoundsSummary {
  /** Rodadas não-rascunho, ordenadas por número. */
  rounds: RoundSummary[];
  /** Linhas em status 'draft' (não entram em `rounds`). */
  draftCount: number;
}

export function summarizeRounds(rows: RoundRow[]): RoundsSummary {
  const byNumber = new Map<number, { statuses: AggregatableRoundStatus[]; publishedAt: string | null; groupCount: number }>();
  let draftCount = 0;

  for (const r of rows) {
    if (r.status === 'draft') {
      draftCount += 1;
      continue;
    }
    const n = r.round_number;
    const slot = byNumber.get(n) ?? { statuses: [], publishedAt: null, groupCount: 0 };
    slot.statuses.push(r.status);
    slot.groupCount += 1;
    const pub = r.published_at ?? null;
    if (pub && (!slot.publishedAt || pub < slot.publishedAt)) slot.publishedAt = pub;
    byNumber.set(n, slot);
  }

  const rounds = Array.from(byNumber.entries())
    .map(([roundNumber, info]) => ({
      roundNumber,
      status: aggregateRoundStatus(info.statuses),
      publishedAt: info.publishedAt,
      groupCount: info.groupCount,
    }))
    .sort((a, b) => a.roundNumber - b.roundNumber);

  return { rounds, draftCount };
}
