import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils/chess';
import { siteUrl } from '@/lib/seo';

/*
 * Gambito Lite (app Android) — sincronização dos torneios do organizador.
 * O app entra com Google pelo Supabase Auth e manda o access token no header Authorization;
 * estas rotas conferem o token e escrevem com service_role (lite_tournaments não tem policy de
 * escrita). Formato do backup: BackupCodec do app ("gambito-lite-torneio" v1; v2 acrescenta
 * árbitros, árbitro de cada mesa e quem informou cada resultado — ver lib/lite/arbiter.ts).
 */

export const MAX_BACKUP_BYTES = 2_000_000;

export function liteError(status: number, code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status });
}

/** Usuário do token Bearer, ou null. */
export async function getBearerUser(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await createAdminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULTS = new Set(['*', '1-0', '0-1', '1/2-1/2', 'forfeit_white', 'forfeit_black', 'double_forfeit', 'bye']);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
const optInt = (v: unknown) => v === null || v === undefined || isInt(v);

export type LiteBackup = {
  tournament: { id: string; name: string; type: string; roundsTotal: number; updatedAt: number };
  players: unknown[];
  rounds: unknown[];
  games: unknown[];
  arbiters?: Array<{ id: string; name: string; email: string }>;
  boardArbiters?: Array<{ roundNumber: number; board: number; arbiterId: string }>;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Confere o backup antes de guardar: o SQL de publicação (lite_publish) confia nesses campos
 * (ids UUID, referências internas, códigos de resultado do enum do site).
 */
export function validateBackup(b: unknown): LiteBackup | null {
  if (!isObj(b) || b.format !== 'gambito-lite-torneio' || !isInt(b.version)) return null;
  const t = b.tournament;
  if (!isObj(t) || !isUuid(t.id) || typeof t.name !== 'string' || !t.name.trim()) return null;
  if (t.type !== 'swiss' && t.type !== 'round_robin') return null;
  if (!isInt(t.roundsTotal) || !isInt(t.createdAt) || !isInt(t.updatedAt)) return null;
  if (!Array.isArray(b.players) || !Array.isArray(b.rounds) || !Array.isArray(b.games)) return null;
  if (b.players.length > 1000 || b.rounds.length > 60) return null;

  const playerIds = new Set<string>();
  for (const p of b.players) {
    if (!isObj(p) || !isUuid(p.id) || typeof p.name !== 'string' || !p.name.trim()) return null;
    if (typeof p.active !== 'boolean' || !isInt(p.joinedAtRound) || !optInt(p.startNo) || !optInt(p.rating) || !optInt(p.birthYear)) return null;
    if (p.sex != null && p.sex !== 'm' && p.sex !== 'w') return null;
    playerIds.add(p.id);
  }
  const roundIds = new Set<string>();
  for (const r of b.rounds) {
    if (!isObj(r) || !isUuid(r.id) || !isInt(r.number) || typeof r.finished !== 'boolean' || !isInt(r.createdAt)) return null;
    roundIds.add(r.id);
  }
  for (const g of b.games) {
    if (!isObj(g) || !isUuid(g.id) || !isUuid(g.roundId) || !roundIds.has(g.roundId)) return null;
    if (!isUuid(g.whiteId) || !playerIds.has(g.whiteId)) return null;
    if (g.blackId != null && (!isUuid(g.blackId) || !playerIds.has(g.blackId))) return null;
    if (typeof g.result !== 'string' || !RESULTS.has(g.result) || !optInt(g.board)) return null;
    if (g.byeKind != null && g.byeKind !== 'pairing' && g.byeKind !== 'round_robin') return null;
    if (g.reportedBy != null && (typeof g.reportedBy !== 'string' || g.reportedBy.length > 120)) return null;
  }
  // v2: árbitros (opcionais).
  const arbiterIds = new Set<string>();
  if (b.arbiters != null) {
    if (!Array.isArray(b.arbiters) || b.arbiters.length > 200) return null;
    for (const a of b.arbiters) {
      if (!isObj(a) || !isUuid(a.id) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 120) return null;
      if (typeof a.email !== 'string' || !EMAIL.test(a.email) || a.email.length > 200) return null;
      arbiterIds.add(a.id);
    }
  }
  // v3: categorias (opcionais).
  if (b.categories != null) {
    if (!Array.isArray(b.categories) || b.categories.length > 100) return null;
    for (const c of b.categories) {
      if (!isObj(c) || !isUuid(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80) return null;
      if (![c.minAge, c.maxAge, c.minRating, c.maxRating, c.sortOrder].every(optInt)) return null;
      if (c.sex != null && c.sex !== 'm' && c.sex !== 'w') return null;
    }
  }
  if (b.boardArbiters != null) {
    if (!Array.isArray(b.boardArbiters) || b.boardArbiters.length > 5000) return null;
    for (const ba of b.boardArbiters) {
      if (!isObj(ba) || !isInt(ba.roundNumber) || !isInt(ba.board) || !isUuid(ba.arbiterId) || !arbiterIds.has(ba.arbiterId)) return null;
    }
  }
  return b as unknown as LiteBackup;
}

/** Slug da primeira publicação: mesmo padrão dos importados (nome + data), com sufixo se já existir. */
export async function freeSlug(name: string, createdAtMs: number, id: string) {
  const day = new Date(createdAtMs).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/-/g, '');
  const base = `${slugify(name) || 'torneio'}-${day}`;
  const { data } = await createAdminClient().from('tournaments').select('id').eq('slug', base).maybeSingle();
  return !data || data.id === id ? base : `${base}-${id.slice(0, 6)}`;
}

export function tournamentUrl(slug: string) {
  return `${siteUrl()}/torneios/${slug}`;
}
