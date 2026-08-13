import type { SupabaseClient } from '@supabase/supabase-js';
import type { TournamentStatus } from '@/types/database';

/**
 * Resolução de "de qual torneio a pessoa está falando" pro Gambito
 * (lib/chat/tools.ts). Duas fontes de sinal: o slug da página em que o widget
 * está aberto (ambiente) e o nome/slug que a pessoa escreveu na pergunta.
 *
 * GARANTIA DE SEGURANÇA: a busca é SEMPRE pelo client com RLS do usuário
 * (`supabase`), nunca service_role. Assim o id que chega nos RPCs
 * `security definer` (get_tournament_standings/get_round_pairings/…) é sempre
 * um id que a RLS já provou visível — o modelo nunca escolhe um id cru, então
 * não dá pra sondar rascunho alheio. Rascunho do PRÓPRIO usuário passa
 * (policy created_by = auth.uid()), que é o correto.
 */

/** lowercase + remove acento (NFD) — pra casar "joao" com "João". */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Casa `query` contra full_name de forma tolerante a acento/caixa. Casamento em memória. */
export function matchPlayerNames<T extends { full_name: string }>(rows: T[], query: string, limit = 5): T[] {
  const q = normalizeName(query);
  if (!q) return [];
  const matches = rows.filter((r) => normalizeName(r.full_name).includes(q));
  return matches.slice(0, limit);
}

const RESERVED_SLUGS = new Set(['new']);

/**
 * Extrai o slug do torneio de um pathname tipo /tournaments/<slug>/... ou
 * /admin/tournaments/<slug>/... . Descarta segmentos reservados (ex.: /new).
 */
export function tournamentSlugFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/(?:admin\/)?tournaments\/([^/?#]+)/);
  if (!m) return null;
  const slug = m[1];
  if (RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

export interface ResolvedTournament {
  id: string;
  slug: string;
  name: string;
  status: TournamentStatus;
  rounds_count: number;
  registration_end_date: string | null;
  registration_closes_by_date: boolean;
  has_absolute_classification: boolean;
}

export interface TournamentCandidate {
  nome: string;
  slug: string;
  cidade: string | null;
  status: string;
}

export type TournamentResolution =
  | { ok: true; torneio: ResolvedTournament }
  | { ok: false; erro: 'nao_encontrado' | 'ambiguo' | 'sem_torneio'; candidatos?: TournamentCandidate[] };

const SELECT_COLS =
  'id, slug, name, city, status, rounds_count, registration_end_date, registration_closes_by_date, has_absolute_classification';

function toResolved(row: any): ResolvedTournament {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    rounds_count: row.rounds_count,
    registration_end_date: row.registration_end_date ?? null,
    registration_closes_by_date: row.registration_closes_by_date ?? true,
    has_absolute_classification: row.has_absolute_classification ?? true,
  };
}

/**
 * `hint` = o argumento `torneio` que o modelo mandou (slug ou nome), pode ser
 * vazio/undefined. `ambientSlug` = slug da página onde o widget está aberto.
 * Precedência: hint explícito > ambiente. Sem nenhum dos dois → 'sem_torneio'
 * (o modelo então pergunta qual). Vários casamentos por nome → 'ambiguo' com
 * a lista de candidatos, tudo na MESMA rodada de ferramenta (não gasta outra).
 */
export async function resolveTournament(
  supabase: SupabaseClient,
  hint: unknown,
  ambientSlug: string | null,
): Promise<TournamentResolution> {
  const hintStr = typeof hint === 'string' ? hint.trim() : '';

  // 1. hint explícito: tenta slug exato, depois nome (ilike).
  if (hintStr) {
    const bySlug = await supabase.from('tournaments').select(SELECT_COLS).eq('slug', hintStr).maybeSingle();
    if (bySlug.data) return { ok: true, torneio: toResolved(bySlug.data) };

    const byName = await supabase
      .from('tournaments')
      .select(SELECT_COLS)
      .ilike('name', `%${hintStr}%`)
      .order('start_date', { ascending: false })
      .limit(6);
    const rows = byName.data ?? [];
    if (rows.length === 0) return { ok: false, erro: 'nao_encontrado' };
    if (rows.length === 1) return { ok: true, torneio: toResolved(rows[0]) };
    return {
      ok: false,
      erro: 'ambiguo',
      candidatos: rows.map((r: any) => ({ nome: r.name, slug: r.slug, cidade: r.city ?? null, status: r.status })),
    };
  }

  // 2. sem hint: usa o slug da página atual.
  if (ambientSlug) {
    const byAmbient = await supabase.from('tournaments').select(SELECT_COLS).eq('slug', ambientSlug).maybeSingle();
    if (byAmbient.data) return { ok: true, torneio: toResolved(byAmbient.data) };
    return { ok: false, erro: 'nao_encontrado' };
  }

  // 3. nada pra resolver.
  return { ok: false, erro: 'sem_torneio' };
}
