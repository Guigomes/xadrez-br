'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSeries, useSeriesRules, useSetPointsRules } from '@/lib/hooks/use-series';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { FlashMessage } from '@/components/ui/flash-message';

/** Escala clássica de circuito brasileiro — ponto de partida, não regra fixa. */
const PRESETS: { name: string; points: number[] }[] = [
  { name: '10-8-6-5-4-3-2-1', points: [10, 8, 6, 5, 4, 3, 2, 1] },
  { name: '10 a 1 (top 10)', points: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
  { name: '25-18-15-12-10-8-6-4-2-1', points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
];

export default function SeriesPointsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const { data: series, isLoading } = useSeries(slug);
  const { data: rules, isLoading: loadingRules } = useSeriesRules(series?.id);
  const save = useSetPointsRules(series?.id ?? '');

  const [draft, setDraft] = useState<{ place: number; points: string }[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Só semeia o rascunho quando as regras chegam do servidor. Sem o guarda de
  // `loadingRules`, o efeito rodava com `rules` undefined e zerava a edição
  // em andamento a cada refetch em background.
  useEffect(() => {
    if (loadingRules || !rules) return;
    setDraft(rules.map((r) => ({ place: r.place, points: String(r.points) })));
  }, [rules, loadingRules]);

  if (isLoading || !series) return <PageSpinner />;

  function applyPreset(points: number[]) {
    setDraft(points.map((p, i) => ({ place: i + 1, points: String(p) })));
    setSaved(false);
  }

  function setPoints(index: number, value: string) {
    setDraft((prev) => prev.map((r, i) => (i === index ? { ...r, points: value } : r)));
    setSaved(false);
  }

  function addPlace() {
    setDraft((prev) => [...prev, { place: prev.length + 1, points: '' }]);
    setSaved(false);
  }

  function removeLast() {
    setDraft((prev) => prev.slice(0, -1));
    setSaved(false);
  }

  async function handleSave() {
    setError('');
    const parsed = draft.map((r) => ({ place: r.place, points: Number(r.points) }));
    if (parsed.some((r) => !Number.isFinite(r.points))) {
      setError('Toda colocação precisa de um valor numérico.');
      return;
    }
    try {
      await save.mutateAsync(parsed);
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível salvar a tabela.');
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {searchParams.get('criada') && (
        <FlashMessage message="Série criada. Agora defina quantos pontos cada colocação vale." />
      )}

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Pontos por colocação</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Vale para cada etapa encerrada. A colocação é apurada dentro do grupo de emparceiramento
            do torneio, e separadamente em cada faixa de classificação. Quem ficar fora desta tabela
            recebe {series.points_outside_table} ponto(s) — configurável na aba Editar.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">Modelos prontos</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p.points)}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {draft.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhuma regra cadastrada — hoje toda colocação vale {series.points_outside_table} ponto(s).
            Escolha um modelo acima ou monte a sua.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {draft.map((r, i) => (
              <label key={r.place} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                  {r.place}º
                </span>
                <input
                  type="number"
                  step="0.5"
                  value={r.points}
                  onChange={(e) => setPoints(i, e.target.value)}
                  className="h-9 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={addPlace}>
            + Colocação
          </Button>
          {draft.length > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={removeLast}>
              Remover a última
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <Button onClick={handleSave} loading={save.isPending}>
            Salvar tabela
          </Button>
          {saved && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              ✓ Salvo — classificação recalculada
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
