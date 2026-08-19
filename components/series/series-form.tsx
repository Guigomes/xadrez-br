'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Chip } from '@/components/admin/classification-ui';
import { SeriesTiebreakPicker } from '@/components/series/series-tiebreak-picker';
import { BR_STATES } from '@/lib/utils/chess';
import type { ClassificationDimension, SeriesTiebreakKey } from '@/types/database';

const schema = z
  .object({
    name: z.string().min(3, 'Informe o nome da série'),
    description: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    organizer_name: z.string().min(2, 'Informe o organizador'),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.start_date && v.end_date && v.end_date < v.start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_date'],
        message: 'O término não pode ser antes do início',
      });
    }
  });

export type SeriesFormValues = z.infer<typeof schema>;

/** Tudo que o form devolve: os campos do zod + o que é editado por chips. */
export interface SeriesFormPayload extends SeriesFormValues {
  classification_dimensions: ClassificationDimension[];
  has_absolute_classification: boolean;
  points_outside_table: number;
  tiebreak_order: SeriesTiebreakKey[];
}

interface Props {
  defaultValues?: Partial<SeriesFormPayload>;
  onSubmit: (values: SeriesFormPayload) => void;
  formId: string;
  /** Trava tudo depois que a série já tem etapas pontuando. */
  readOnly?: boolean;
  /** Contrato de classificação já vale pras etapas vinculadas — avisa antes de mudar. */
  lockedDimensionsReason?: string;
  dimensions: ClassificationDimension[];
  onDimensionsChange: (d: ClassificationDimension[]) => void;
  absolute: boolean;
  onAbsoluteChange: (v: boolean) => void;
  pointsOutside: number;
  onPointsOutsideChange: (v: number) => void;
  tiebreak: SeriesTiebreakKey[];
  onTiebreakChange: (v: SeriesTiebreakKey[]) => void;
}

const DIMENSION_LABELS: Record<ClassificationDimension, string> = {
  age: 'Idade (Sub-8, Sub-12…)',
  rating: 'Rating (faixas)',
  sex: 'Feminino',
};

export function SeriesForm({
  defaultValues, onSubmit, formId, readOnly, lockedDimensionsReason,
  dimensions, onDimensionsChange,
  absolute, onAbsoluteChange,
  pointsOutside, onPointsOutsideChange,
  tiebreak, onTiebreakChange,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SeriesFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      city: defaultValues?.city ?? '',
      state: defaultValues?.state ?? '',
      organizer_name: defaultValues?.organizer_name ?? '',
      start_date: defaultValues?.start_date ?? '',
      end_date: defaultValues?.end_date ?? '',
    },
  });

  function toggleDimension(d: ClassificationDimension) {
    onDimensionsChange(
      dimensions.includes(d) ? dimensions.filter((x) => x !== d) : [...dimensions, d]
    );
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit((values) =>
        onSubmit({
          ...values,
          classification_dimensions: dimensions,
          has_absolute_classification: absolute,
          points_outside_table: pointsOutside,
          tiebreak_order: tiebreak,
        })
      )}
      className="space-y-5"
    >
      {/* min-w-0: fieldset tem `min-width: min-content` por padrão e estoura
          os grids de 2 colunas em tela estreita. Mesmo motivo do
          components/tournament/tournament-form.tsx. */}
      <fieldset disabled={readOnly} className="min-w-0 space-y-5">
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Informações básicas</h2>
          <Input label="Nome da série *" error={errors.name?.message} {...register('name')} />
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Descrição
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              rows={3}
              placeholder="Regulamento, premiação, quantas etapas…"
              {...register('description')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cidade" {...register('city')} />
            <Select label="Estado" {...register('state')}>
              <option value="">Selecionar...</option>
              {BR_STATES.map((s) => (
                <option key={s.uf} value={s.uf}>{s.uf}</option>
              ))}
            </Select>
          </div>
          <Input label="Organizador *" error={errors.organizer_name?.message} {...register('organizer_name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início" type="date" {...register('start_date')} />
            <Input label="Término" type="date" error={errors.end_date?.message} {...register('end_date')} />
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Classificação</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Este é o padrão da série inteira: <strong>toda etapa precisa usar o mesmo</strong>.
              Um torneio que classifica por rating não pode ser etapa de uma série por idade —
              a soma seria de coisas incomparáveis.
            </p>
          </div>

          {lockedDimensionsReason && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              {lockedDimensionsReason}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DIMENSION_LABELS) as ClassificationDimension[]).map((d) => (
              <Chip key={d} active={dimensions.includes(d)} onClick={() => toggleDimension(d)}>
                {DIMENSION_LABELS[d]}
              </Chip>
            ))}
          </div>
          {dimensions.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Nenhuma faixa: a série terá só o ranking absoluto, e só aceita etapas sem
              classificação por faixa.
            </p>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-3 dark:border-gray-800">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Premiar a classificação absoluta?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                O ranking transversal, somando todo mundo além das faixas.
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Chip active={absolute} onClick={() => onAbsoluteChange(true)}>Sim</Chip>
              <Chip active={!absolute} onClick={() => onAbsoluteChange(false)}>Não</Chip>
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Desempate da série</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Aplicado quando dois jogadores somam a mesma pontuação de série. Não confundir
              com o desempate de xadrez de cada torneio (Buchholz e companhia), que decide a
              colocação dentro da etapa.
            </p>
          </div>
          <SeriesTiebreakPicker value={tiebreak} onChange={onTiebreakChange} />

          <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
            <Input
              label="Pontos para quem ficou fora da tabela"
              type="number"
              step="0.5"
              min="0"
              value={pointsOutside}
              onChange={(e) => onPointsOutsideChange(Number(e.target.value) || 0)}
              hint="Colocação sem regra cadastrada vale isto. Use para dar ponto de presença sem cadastrar 200 linhas."
            />
          </div>
        </div>
      </fieldset>
    </form>
  );
}
