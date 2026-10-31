import type { CSSProperties } from 'react';
import { formatScore, formatTiebreak, TIEBREAK_INFO } from '@/lib/utils/chess';
import { playerDisplayName } from '@/lib/utils/player-name';
import { localizedTitle } from '@/lib/utils/player-title';
import type { StandingRow } from '@/types/database';

export type TvStandingRow = Pick<StandingRow, 'tp_id' | 'rank' | 'title' | 'full_name' | 'fide_name' | 'rating_tempo' | 'points'>
  & Partial<Pick<StandingRow, 'wins' | 'buchholz' | 'buchholz_cut1' | 'sonneborn_berger' | 'progressive' | 'performance_rating'>>;

// Critérios que a classificação guarda por jogador. Confronto direto não tem coluna: depende
// de cada par empatado, então só aparece na legenda da ordem.
const TIEBREAK_VALUES: Record<string, (row: TvStandingRow) => string> = {
  buchholz: (row) => formatTiebreak(row.buchholz),
  buchholz_cut1: (row) => formatTiebreak(row.buchholz_cut1),
  sonneborn_berger: (row) => formatTiebreak(row.sonneborn_berger),
  progressive: (row) => formatTiebreak(row.progressive),
  wins: (row) => String(row.wins ?? 0),
  performance_rating: (row) => (row.performance_rating == null ? '–' : String(row.performance_rating)),
};

const tiebreakInfo = (key: string) => TIEBREAK_INFO[key as keyof typeof TIEBREAK_INFO];

export function TvStandings({ rows, locale, groupName, tiebreakOrder = [] }: {
  rows: TvStandingRow[]; locale: string; groupName?: string | null; tiebreakOrder?: string[];
}) {
  const known = tiebreakOrder.filter((key) => tiebreakInfo(key));
  const columns = known.filter((key) => key in TIEBREAK_VALUES);
  // Em TV larga (2xl+) a tabela vira duas colunas de jogadores (1.ª metade à esquerda, 2.ª à direita),
  // metade das linhas. Os cabeçalhos saem (ficam só para leitor de tela) e cada critério leva o rótulo
  // acima do valor via data-label. Abaixo disso segue a tabela normal de uma coluna.
  const gridVars = { '--tv-rows': Math.ceil(rows.length / 2), '--tv-tb': columns.length } as CSSProperties;
  return (
    <div data-tv-standings className="mx-auto w-full max-w-5xl px-2 py-3 sm:px-5 lg:px-8 2xl:max-w-none">
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h2 className="text-3xl font-black sm:text-4xl">Classificação</h2>
        {groupName && <p className="text-xl font-semibold text-brand-200">{groupName}</p>}
        <p className="text-sm text-brand-200">Pontuação atualizada com os resultados lançados</p>
      </div>
      {known.length > 0 && (
        <p className="-mt-3 mb-5 text-base text-brand-200">
          <span className="font-semibold text-white">Desempate:</span>{' '}
          {known.map((key, index) => `${index + 1}º ${tiebreakInfo(key).label}`).join(' · ')}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white/10 p-8 text-center text-2xl">Aguardando participantes para a classificação</p>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-y-2 text-left 2xl:block">
          <caption className="sr-only">Classificação atual{groupName ? ` · ${groupName}` : ''}</caption>
          <thead className="text-sm text-brand-200 sm:text-base 2xl:sr-only">
            <tr>
              <th scope="col" className="w-16 px-3 pb-1 sm:w-24">Pos.</th>
              <th scope="col" className="px-3 pb-1">Jogador</th>
              {columns.map((key) => (
                <th key={key} scope="col" title={tiebreakInfo(key).label} className="hidden w-20 px-2 pb-1 text-center md:table-cell lg:w-24">{tiebreakInfo(key).short}</th>
              ))}
              <th scope="col" className="w-20 px-3 pb-1 text-right sm:w-28">Pontos</th>
            </tr>
          </thead>
          <tbody
            role="rowgroup"
            style={gridVars}
            className="2xl:grid 2xl:grid-flow-col 2xl:grid-cols-2 2xl:gap-x-5 2xl:gap-y-3 2xl:[grid-template-rows:repeat(var(--tv-rows),auto)]"
          >
            {rows.map((row) => (
              <tr
                key={row.tp_id}
                role="row"
                className="bg-white text-gray-900 shadow-md 2xl:grid 2xl:items-center 2xl:rounded-2xl 2xl:[grid-template-columns:4rem_minmax(0,1fr)_repeat(var(--tv-tb),4.5rem)_5.5rem]"
              >
                <td role="cell" className="rounded-l-2xl px-3 py-4 text-2xl font-black text-brand-700 sm:text-3xl">{row.rank ?? '—'}</td>
                <th scope="row" role="rowheader" className="break-words px-3 py-4 text-xl font-bold sm:text-3xl">
                  {localizedTitle(row.title, locale) && <span className="mr-2 text-base font-semibold text-amber-600">{localizedTitle(row.title, locale)}</span>}
                  {playerDisplayName(row.full_name, row.fide_name, locale)}
                  <span className="mt-1 block text-sm font-medium text-gray-500 sm:text-base">{row.rating_tempo == null ? 'Sem rating' : `Rating ${row.rating_tempo}`}</span>
                </th>
                {columns.map((key) => (
                  <td
                    key={key}
                    role="cell"
                    data-label={tiebreakInfo(key).short}
                    className="hidden px-2 py-4 text-center text-xl font-semibold tabular-nums text-gray-600 md:table-cell lg:text-2xl 2xl:block 2xl:before:block 2xl:before:text-xs 2xl:before:font-medium 2xl:before:text-gray-400 2xl:before:content-[attr(data-label)]"
                  >{TIEBREAK_VALUES[key](row)}</td>
                ))}
                <td role="cell" className="rounded-r-2xl px-3 py-4 text-right text-3xl font-black text-brand-800 sm:text-4xl">{row.points === 0.5 ? '½' : formatScore(row.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
