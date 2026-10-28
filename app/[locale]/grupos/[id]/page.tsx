import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { localizedTitle } from '@/lib/utils/player-title';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser, redirectToLogin } from '@/lib/data/session';
import { PlayerAreaTabs } from '@/components/player-hub/player-area-tabs';
import { AddMember, DeleteGroup, MemberNote, RemoveMember } from '@/components/groups/group-actions';
import {
  GROUP_KIND_LABEL, SORT_LABEL, groupSummary, memberAge, memberPct, sortMembers,
  type GroupKind, type GroupMemberRow, type SortKey,
} from '@/lib/groups/overview';
import { numberLabel } from '@/lib/player-history/types';

export const metadata: Metadata = { title: 'Painel do grupo' };

type RecentGame = {
  player_id: string; player_name: string; source: 'live' | 'history'; game_id: string; tournament_slug: string;
  tournament_name: string; start_date: string; round_number: number; color: 'white' | 'black';
  opponent_name: string | null; opponent_rating: number | null; result: string; points: number | string; has_pgn: boolean;
};

const PERIODS = [30, 90, 365];
const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const outcome = (pts: number | string) => (Number(pts) === 1 ? 'Vitória' : Number(pts) === 0 ? 'Derrota' : 'Empate');
const outcomeClass = (pts: number | string) =>
  Number(pts) === 1 ? 'text-brand-600 dark:text-brand-400' : Number(pts) === 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300';

export default async function GroupPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ordem?: string; dias?: string; lances?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale();
  const user = await getSessionUser();
  if (!user) return redirectToLogin(`/grupos/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const sort: SortKey = (Object.keys(SORT_LABEL) as SortKey[]).includes(sp.ordem as SortKey) ? (sp.ordem as SortKey) : 'std';
  const days = PERIODS.includes(Number(sp.dias)) ? Number(sp.dias) : 90;
  const onlyPgn = sp.lances === '1';

  const supabase = await createClient();
  const { data: group } = await supabase.from('player_groups').select('id, name, kind').eq('id', id).maybeSingle();
  if (!group) notFound();

  const [{ data: overview }, { data: recent }] = await Promise.all([
    supabase.rpc('get_group_overview', { p_group_id: id, p_days: days }),
    supabase.rpc('get_group_recent_games', { p_group_id: id, p_days: days, p_only_pgn: onlyPgn }),
  ]);
  const members = sortMembers((overview ?? []) as GroupMemberRow[], sort);
  const games = (recent ?? []) as RecentGame[];
  const summary = groupSummary(members);

  const link = (over: Partial<{ ordem: string; dias: number; lances: string }>) => {
    const q = new URLSearchParams({ ordem: sort, dias: String(days), ...(onlyPgn ? { lances: '1' } : {}) });
    for (const [k, v] of Object.entries(over)) {
      if (v === '' || v === undefined) q.delete(k);
      else q.set(k, String(v));
    }
    return `/grupos/${id}?${q.toString()}`;
  };
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-brand-600 text-white dark:bg-brand-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`;

  return (
    <div className="container-app max-w-5xl py-8 space-y-8">
      <PlayerAreaTabs />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/grupos" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">← Meus grupos</Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{group.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{GROUP_KIND_LABEL[group.kind as GroupKind]}</p>
        </div>
        <DeleteGroup groupId={id} name={group.name} />
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Jogadores" value={String(summary.members)} />
        <Metric label={`Jogaram (${days} dias)`} value={String(summary.active)} />
        <Metric label="Partidas no período" value={`${summary.games}${summary.pgnGames ? ` · ${summary.pgnGames} c/ lances` : ''}`} />
        <Metric label="Rating clássico médio" value={summary.avgStd ? String(summary.avgStd) : '—'} />
      </section>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Período:</span>
        {PERIODS.map((d) => <Link key={d} href={link({ dias: d })} className={pill(d === days)}>{d === 365 ? '1 ano' : `${d} dias`}</Link>)}
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ranking interno</h2>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <Link key={k} href={link({ ordem: k })} className={pill(k === sort)}>{SORT_LABEL[k]}</Link>)}
          </div>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Inclua jogadores abaixo para montar o painel.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-left text-xs text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Jogador</th>
                  <th className="px-3 py-2 font-medium text-right">Clássico</th>
                  <th className="px-3 py-2 font-medium text-right">Rápido</th>
                  <th className="px-3 py-2 font-medium text-right">Blitz</th>
                  <th className="px-3 py-2 font-medium text-right">Partidas</th>
                  <th className="px-3 py-2 font-medium text-right">Aprov.</th>
                  <th className="px-3 py-2 font-medium">Último torneio</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => {
                  const pct = memberPct(m);
                  const age = memberAge(m.birth_year);
                  return (
                    <tr key={m.player_id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                      <td className="px-3 py-2 tabular-nums text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-baseline gap-2">
                          <Link href={`/jogadores/${m.player_id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">
                            {m.title ? `${localizedTitle(m.title, locale)} ` : ''}{m.full_name}
                          </Link>
                          <RemoveMember groupId={id} playerId={m.player_id} name={m.full_name} />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{[age ? `${age} anos` : null, m.state, m.cbx_id ? `CBX ${m.cbx_id}` : null].filter(Boolean).join(' · ')}</p>
                        <MemberNote groupId={id} playerId={m.player_id} note={m.note} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.rating_std ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.rating_rpd ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.rating_blz ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.games}{m.pgn_games ? <span className="text-xs text-gray-400"> ({m.pgn_games} c/ lances)</span> : null}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct === null ? '—' : `${numberLabel(pct)}%`}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{m.last_tournament_name ? `${m.last_tournament_name} (${fmt(m.last_tournament_date)})` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Ratings atuais do cadastro. Partidas e aproveitamento contam só partidas jogadas no período (sem W.O.);
          o aproveitamento só ordena quem jogou ao menos 3. As anotações são privadas: só você vê.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Incluir jogadores</h2>
        <AddMember groupId={id} memberIds={members.map((m) => m.player_id)} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Partidas recentes ({games.length})</h2>
          <div className="flex gap-1.5">
            <Link href={link({ lances: '' })} className={pill(!onlyPgn)}>Todas</Link>
            <Link href={link({ lances: '1' })} className={pill(onlyPgn)}>Só com lances (para revisar)</Link>
          </div>
        </div>
        {games.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma partida no período.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-800">
            {games.map((g) => (
              <li key={`${g.source}:${g.game_id}:${g.player_id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <Link href={`/jogadores/${g.player_id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">{g.player_name}</Link>
                  <span className="text-gray-500 dark:text-gray-400"> {g.color === 'white' ? 'de brancas' : 'de pretas'} x {g.opponent_name ?? '?'}{g.opponent_rating ? ` (${g.opponent_rating})` : ''}</span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className={`font-medium ${outcomeClass(g.points)}`}>{outcome(g.points)}</span>
                  <Link href={g.source === 'live' ? `/torneios/${g.tournament_slug}` : `/historico/${g.tournament_slug}`}
                    className="text-xs text-gray-500 hover:underline dark:text-gray-400">
                    {g.tournament_name} · R{g.round_number} · {fmt(g.start_date)}
                  </Link>
                  {g.has_pgn && <span className="rounded bg-brand-50 px-1.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">lances</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {games.length >= 300 && <p className="mt-2 text-xs text-gray-400">Mostrando as 300 mais recentes. Diminua o período para ver o resto.</p>}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
