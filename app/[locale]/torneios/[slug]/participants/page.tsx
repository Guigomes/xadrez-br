import { Link } from '@/i18n/navigation';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { StateBadge } from '@/components/player/state-badge';
import { cn } from '@/lib/utils/cn';
import { compareParticipantOrder, compareGroupNames } from '@/lib/utils/chess';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ group?: string; page?: string; q?: string }>;
}

/** Um torneio grande passa de 250 inscritos; renderizar tudo de uma vez era o
 *  gargalo real da aba (não a consulta, que roda em ~700ms). */
const PAGE_SIZE = 50;

export default async function ParticipantsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { group: selectedGroupId, page: pageParam, q } = await searchParams;
  const searchQuery = q?.trim().slice(0, 80) ?? '';

  const pageNum = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  // Mesma chamada que o layout já fez pra este slug — cache() do React
  // dedupe dentro do request, não é uma segunda viagem ao Supabase.
  const data = await getTournamentPageData(slug);
  if (!data) notFound();
  const { tournament } = data;

  const supabase = await createClient();

  // Página de jogadores e lista de grupos são independentes — rodam juntas.
  // O filtro por grupo voltou a ser feito em SQL (era em JS): com paginação
  // ele PRECISA entrar antes do range, senão a página 2 de um grupo traria
  // as linhas erradas. Se o id vier inválido de uma URL velha, o resultado
  // é vazio e cai no empty state — melhor que ignorar o filtro em silêncio.
  let playersQuery = supabase
    .from('tournament_players')
    .select(
      `
        id, player_id, initial_ranking, current_score, current_rank, status, pairing_group_id,
        player:players(id, full_name, title, rating_std, state, city, federation, cbx_id, fide_id, club_or_school),
        category:tournament_categories(id, name, pairing_group_id)
      `,
      { count: 'exact' },
    )
    .eq('tournament_id', tournament.id);

  if (selectedGroupId) {
    playersQuery = playersQuery.eq('pairing_group_id', selectedGroupId);
  }

  // A busca fica no banco, mas em duas etapas para não depender de filtros
  // PostgREST em relações aninhadas: encontra os jogadores e depois restringe
  // as inscrições deste torneio aos ids encontrados.
  if (searchQuery) {
    const term = searchQuery.replace(/[,%_()."'\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) {
      const filter = [
        'full_name', 'title', 'fide_id', 'cbx_id', 'club_or_school', 'city', 'state', 'federation',
      ].map((field) => `${field}.ilike.%${term}%`).join(',');
      const { data: matchingPlayers } = await supabase
        .from('players')
        .select('id')
        .or(filter)
        .limit(2000);
      const matchingIds = (matchingPlayers ?? []).map((player) => player.id);
      playersQuery = matchingIds.length > 0
        ? playersQuery.in('player_id', matchingIds)
        : playersQuery.eq('player_id', '00000000-0000-0000-0000-000000000000');
    } else {
      playersQuery = playersQuery.eq('player_id', '00000000-0000-0000-0000-000000000000');
    }
  }

  const [{ data: pairingGroups }, { data: playersData, count }] = await Promise.all([
    supabase
      .from('pairing_groups')
      .select('id, name')
      .eq('tournament_id', tournament.id)
      .order('sort_order', { ascending: true }),
    playersQuery
      .order('initial_ranking', { ascending: true, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1),
  ]);

  const groups = [...(pairingGroups ?? [])].sort((a, b) => compareGroupNames(a.name, b.name));
  const hasGroups = groups.length > 0;
  // Todo torneio nativo nasce com UM grupo chamado "Absoluto"
  // (lib/utils/create-tournament-setup.ts), então com um grupo só os chips
  // seriam "Todos" e "Absoluto" filtrando exatamente o mesmo conjunto — e a
  // coluna "Grupo" repetiria o mesmo nome em toda linha. Filtro de grupo só
  // faz sentido a partir de dois. (Não confundir com o "Absoluto" da
  // classificação, que é o eixo transversal `has_absolute_classification`.)
  const showGroupFilter = groups.length > 1;
  // Enquanto o seed não foi gerado (initial_ranking todo null), a ordem do
  // banco não significa nada — reordena por rating/nome (chess.ts). Só dentro
  // da página atual: com seed gerado a ordem do banco já é a definitiva, e sem
  // seed nenhuma ordem entre páginas seria estável de qualquer jeito.
  const players = playersData ? [...playersData].sort(compareParticipantOrder) : playersData;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/torneios/${slug}/participants`;

  /** Preserva o filtro de grupo ao paginar, e omite `page=1` da URL. */
  function pageHref(n: number) {
    const qs = new URLSearchParams();
    if (selectedGroupId) qs.set('group', selectedGroupId);
    if (searchQuery) qs.set('q', searchQuery);
    if (n > 1) qs.set('page', String(n));
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  }

  if (!players?.length && !hasGroups) {
    return (
      <EmptyState
        icon="👥"
        title="Nenhum participante cadastrado"
        description="Os participantes serão listados assim que inscritos."
      />
    );
  }

  const activeGroup = hasGroups && selectedGroupId
    ? groups.find((g) => g.id === selectedGroupId)
    : null;

  const showGroupColumn = !activeGroup && showGroupFilter;

  return (
    <div>
      <form action={base} className="card mb-5 grid gap-3 p-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(16rem,2fr)_auto] sm:items-end">
        {showGroupFilter && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Grupo</span>
            <select
              name="group"
              defaultValue={selectedGroupId ?? ''}
              className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="">Todos os grupos</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
        )}
        <label className={cn('block', !showGroupFilter && 'sm:col-span-2')}>
          <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Buscar participante</span>
          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="Nome, FIDE, CBX, escola, cidade ou UF"
            className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </label>
        <button type="submit" className="min-h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600">
          Buscar
        </button>
      </form>

      {!players?.length ? (
        <EmptyState
          icon="👥"
          title={searchQuery ? 'Nenhum participante encontrado' : 'Nenhum participante neste grupo'}
          description={searchQuery ? 'Tente outro nome, identificador, escola, cidade ou UF.' : 'Nenhum jogador foi inscrito neste grupo ainda.'}
        />
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {activeGroup ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-300">{activeGroup.name}</span>
                {' — '}
              </>
            ) : null}
            {searchQuery
              ? `${total} resultado${total !== 1 ? 's' : ''}`
              : `${total} participante${total !== 1 ? 's' : ''} inscrito${total !== 1 ? 's' : ''}`}
            {totalPages > 1 && (
              <span className="text-gray-400 dark:text-gray-500">
                {' · '}página {pageNum} de {totalPages}
              </span>
            )}
            {searchQuery && (
              <Link
                href={selectedGroupId ? `${base}?group=${selectedGroupId}` : base}
                className="ml-2 font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Limpar busca
              </Link>
            )}
          </p>

          {/* Uma tabela só pros dois tamanhos de tela. Antes eram DUAS árvores
              no mesmo HTML (tabela `hidden sm:block` + lista `sm:hidden`), o
              que dobrava o custo de render: 275 inscritos viravam 550 blocos,
              metade invisível. Agora cada inscrito é uma linha; no mobile as
              colunas secundárias somem e os dados aparecem numa sub-linha
              dentro da célula do nome. */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{activeGroup ? 'Inicial' : '#'}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Jogador</th>
                  {showGroupColumn && (
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Grupo</th>
                  )}
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Categoria</th>
                  <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Rating</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Cidade</th>
                  <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">UF</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Escola/Clube</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">IDs</th>
                </tr>
              </thead>
              <tbody>
                {players.map((tp, i) => {
                  const cat = tp.category;
                  const player = tp.player;
                  const playerGroup = tp.pairing_group_id
                    ? groups.find((g) => g.id === tp.pairing_group_id)
                    : null;
                  // Importações antigas gravavam "Clube/Cidade" em `city`.
                  // Até a próxima sincronização preencher club_or_school,
                  // apresenta o dado no rótulo correto sem duplicá-lo.
                  const displayClub = player?.club_or_school
                    ?? (tournament.mode === 'imported' ? player?.city : null);
                  const displayCity = tournament.mode === 'imported'
                    && displayClub?.trim().toLocaleLowerCase('pt-BR') === player?.city?.trim().toLocaleLowerCase('pt-BR')
                    ? null
                    : player?.city;
                  const ids = [
                    player?.cbx_id ? `CBX ${player.cbx_id}` : null,
                    player?.fide_id ? `FIDE ${player.fide_id}` : null,
                  ].filter(Boolean).join(' · ');

                  return (
                    <tr
                      key={tp.id}
                      className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 px-3 align-top text-gray-400 dark:text-gray-500 tabular-nums sm:align-middle">
                        {activeGroup ? (tp.initial_ranking ?? from + i + 1) : from + i + 1}
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          href={`/torneios/${slug}/players/${tp.id}${tp.pairing_group_id ? `?group=${tp.pairing_group_id}` : ''}`}
                          className="font-medium text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        >
                          {player?.title && <span className="mr-1 text-gray-400 dark:text-gray-500">{player.title}</span>}
                          {player?.full_name}
                        </Link>
                        {tp.status === 'withdrawn' && (
                          <Badge className="ml-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            Retirado
                          </Badge>
                        )}
                        {/* Só no mobile: o resumo do que as colunas escondidas
                            à direita mostrariam. */}
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400 sm:hidden">
                          {playerGroup?.name && <span className="font-medium text-brand-600 dark:text-brand-400">{playerGroup.name}</span>}
                          <StateBadge state={player?.state} />
                          {cat?.name && <span>{cat.name}</span>}
                          {displayCity && <span>{displayCity}</span>}
                          {displayClub && <span>{displayClub}</span>}
                          {player?.rating_std && <span>Rating {player.rating_std}</span>}
                          {ids && <span>{ids}</span>}
                        </span>
                      </td>
                      {showGroupColumn && (
                        <td className="hidden py-3 px-3 sm:table-cell">
                          {playerGroup ? (
                            <Link
                              href={`${base}?group=${playerGroup.id}`}
                              className="text-xs text-brand-600 hover:underline dark:text-brand-400"
                            >
                              {playerGroup.name}
                            </Link>
                          ) : '–'}
                        </td>
                      )}
                      <td className="hidden py-3 px-3 sm:table-cell">
                        {cat?.name ? (
                          <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 text-xs">
                            {cat.name}
                          </Badge>
                        ) : '–'}
                      </td>
                      <td className="hidden py-3 px-3 text-center tabular-nums text-gray-700 dark:text-gray-300 sm:table-cell">
                        {player?.rating_std ?? '–'}
                      </td>
                      <td className="hidden py-3 px-3 text-gray-500 dark:text-gray-400 sm:table-cell">
                        {displayCity || '–'}
                      </td>
                      <td className="hidden py-3 px-3 text-center sm:table-cell">
                        <StateBadge state={player?.state} />
                      </td>
                      <td className="hidden py-3 px-3 text-gray-500 dark:text-gray-400 sm:table-cell">
                        {displayClub || '–'}
                      </td>
                      <td className="hidden py-3 px-3 text-gray-500 dark:text-gray-400 sm:table-cell whitespace-nowrap">
                        {ids || '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Paginação">
              {pageNum > 1 ? (
                <Link
                  href={pageHref(pageNum - 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  ← Anterior
                </Link>
              ) : <span />}
              <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                {from + 1}–{Math.min(from + PAGE_SIZE, total)} de {total}
              </span>
              {pageNum < totalPages ? (
                <Link
                  href={pageHref(pageNum + 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Próxima →
                </Link>
              ) : <span />}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
