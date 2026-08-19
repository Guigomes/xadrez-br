'use client';

import type { SeriesTiebreakKey } from '@/types/database';

/**
 * Mesmo mecanismo do TiebreakOrderPicker do torneio (clique adiciona, setas
 * reordenam), com outro domínio: aqui os critérios são da SÉRIE, não de
 * xadrez. Componente separado em vez de generalizar o do torneio porque
 * aquele carrega a legenda de Buchholz/Sonneborn-Berger, que não tem
 * significado nenhum nesta tela.
 */
const LABELS: Record<SeriesTiebreakKey, string> = {
  events: 'Etapas disputadas',
  best_place: 'Melhor colocação',
  chess_points: 'Pontos de xadrez',
};

const HINTS: Record<SeriesTiebreakKey, string> = {
  events: 'Quem participou de mais etapas fica na frente.',
  best_place: 'Quem tem o melhor resultado individual da série fica na frente.',
  chess_points: 'Soma dos pontos ganhos no tabuleiro em todas as etapas.',
};

const ALL: SeriesTiebreakKey[] = ['events', 'best_place', 'chess_points'];

interface Props {
  value: SeriesTiebreakKey[];
  onChange: (v: SeriesTiebreakKey[]) => void;
}

export function SeriesTiebreakPicker({ value, onChange }: Props) {
  function toggle(key: SeriesTiebreakKey) {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else onChange([...value, key]);
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...value];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((key, i) => (
          <span
            key={key}
            title={HINTS[key]}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/50 pl-3 pr-1 py-1 text-xs font-medium text-brand-700 dark:text-brand-300"
          >
            {i + 1}º {LABELS[key]}
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Subir prioridade de ${LABELS[key]}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-brand-100 dark:hover:bg-brand-900 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === value.length - 1}
              aria-label={`Descer prioridade de ${LABELS[key]}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-brand-100 dark:hover:bg-brand-900 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-label={`Remover ${LABELS[key]}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-red-100 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL.filter((k) => !value.includes(k)).map((key) => (
          <button
            key={key}
            type="button"
            title={HINTS[key]}
            onClick={() => toggle(key)}
            className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            + {LABELS[key]}
          </button>
        ))}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Sem critério nenhum, empate na pontuação fica na ordem que o banco devolver.
        </p>
      )}
    </div>
  );
}
