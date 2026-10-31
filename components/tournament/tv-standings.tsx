import { formatScore } from '@/lib/utils/chess';
import { playerDisplayName } from '@/lib/utils/player-name';
import { localizedTitle } from '@/lib/utils/player-title';
import type { StandingRow } from '@/types/database';

export type TvStandingRow = Pick<StandingRow, 'tp_id' | 'rank' | 'title' | 'full_name' | 'fide_name' | 'rating_tempo' | 'points'>;

export function TvStandings({ rows, locale, groupName }: {
  rows: TvStandingRow[]; locale: string; groupName?: string | null;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h2 className="text-3xl font-black sm:text-4xl">Classificação</h2>
        {groupName && <p className="text-xl font-semibold text-brand-200">{groupName}</p>}
        <p className="text-sm text-brand-200">Pontuação atualizada com os resultados lançados</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white/10 p-8 text-center text-2xl">Aguardando participantes para a classificação</p>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-y-2 text-left">
          <caption className="sr-only">Classificação atual{groupName ? ` · ${groupName}` : ''}</caption>
          <thead className="text-sm text-brand-200 sm:text-base">
            <tr><th scope="col" className="w-16 px-3 pb-1 sm:w-24">Pos.</th><th scope="col" className="px-3 pb-1">Jogador</th><th scope="col" className="w-20 px-3 pb-1 text-right sm:w-28">Pontos</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tp_id} className="bg-white text-gray-900 shadow-md">
                <td className="rounded-l-2xl px-3 py-4 text-2xl font-black text-brand-700 sm:text-3xl">{row.rank ?? '—'}</td>
                <th scope="row" className="break-words px-3 py-4 text-xl font-bold sm:text-3xl">
                  {localizedTitle(row.title, locale) && <span className="mr-2 text-base font-semibold text-amber-600">{localizedTitle(row.title, locale)}</span>}
                  {playerDisplayName(row.full_name, row.fide_name, locale)}
                  <span className="mt-1 block text-sm font-medium text-gray-500 sm:text-base">{row.rating_tempo == null ? 'Sem rating' : `Rating ${row.rating_tempo}`}</span>
                </th>
                <td className="rounded-r-2xl px-3 py-4 text-right text-3xl font-black text-brand-800 sm:text-4xl">{row.points === 0.5 ? '½' : formatScore(row.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
