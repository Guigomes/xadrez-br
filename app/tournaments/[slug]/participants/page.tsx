import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { compareParticipantOrder, compareGroupNames } from '@/lib/utils/chess';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ group?: string; page?: string }>;
}

/** Um torneio grande passa de 250 inscritos; renderizar tudo de uma vez era o
 *  gargalo real da aba (não a consulta, que roda em ~700ms). */
const PAGE_SIZE = 50;

export default async function ParticipantsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { group: selectedGroupId, page: pageParam } = await searchParams;

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
        id, initial_ranking, current_score, current_rank, status, pairing_group_id,
        player:players(id, full_name, rating_std, state, city, federation),
        category:tournament_categories(id, name, pairing_group_id)
      `,
      { count: 'exact' },
    )
    .eq('tournament_id', tournament.id);

  if (selectedGroupId) {
    playersQuery = playersQuery.eq('pairing_group_id', selectedGroupId);
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
  const base = `/tournaments/${slug}/participants`;

  /** Preserva o filtro de grupo ao paginar, e omite `page=1` da URL. */
  function pageHref(n: number) {
    const qs = new URLSearchParams();
    if (selectedGroupId) qs.set('group', selectedGroupId);
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
      {/* Pairing group filter tabs */}
      {showGroupFilter && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          <Link
            href={base}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              !selectedGroupId
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
            )}
          >
            Todos
          </Link>
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`${base}?group=${g.id}`}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                selectedGroupId === g.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
              )}
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {!players?.length ? (
        <EmptyState
          icon="👥"
          title="Nenhum participante neste grupo"
          description="Nenhum jogador foi inscrito neste grupo ainda."
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
            {total} participante{total !== 1 ? 's' : ''} inscrito{total !== 1 ? 's' : ''}
            {totalPages > 1 && (
              <span className="text-gray-400 dark:text-gray-500">
                {' · '}página {pageNum} de {totalPages}
              </span>
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
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">#</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Jogador</th>
                  {showGroupColumn && (
                    <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Grupo</th>
                  )}
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Categoria</th>
                  <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Rating</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Escola/Município</th>
                </tr>
              </thead>
              <tbody>
                {players.map((tp, i) => {
                  const cat = tp.category as any;
                  const player = tp.player as any;
                  const playerGroup = showGroupColumn && cat?.pairing_group_id
                    ? groups.find((g) => g.id === cat.pairing_group_id)
                    : null;
                  const place = player?.city || player?.state || '';

                  return (
                    <tr
                      key={tp.id}
                      className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 px-3 align-top text-gray-400 dark:text-gray-500 tabular-nums sm:align-middle">
                        {tp.initial_ranking ?? from + i + 1}
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          href={`/tournaments/${slug}/players/${tp.id}`}
                          className="font-medium text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        >
                          {player?.full_name}
                        </Link>
                        {tp.status === 'withdrawn' && (
                          <Badge className="ml-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            Retirado
                          </Badge>
                        )}
                        {/* Só no mobile: o resumo do que as colunas escondidas
                            à direita mostrariam. */}
                        <span className="mt-0.5 block text-xs text-gray-400 sm:hidden">
                          {[
                            playerGroup?.name,
                            cat?.name,
                            place,
                            player?.rating_std,
                          ].filter(Boolean).join(' · ')}
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
                        {place || '–'}
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
