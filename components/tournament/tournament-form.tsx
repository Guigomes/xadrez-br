'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { TiebreakOrderPicker } from '@/components/tournament/tiebreak-order-picker';
import { BR_STATES } from '@/lib/utils/chess';
import {
  TIME_CONTROL_PRESETS, TIME_CONTROL_OTHER, findPresetByValue,
} from '@/lib/utils/time-control';
import type { TournamentFormValues, TiebreakKey } from '@/types/database';

/** 06:00 até 22:00, de 30 em 30 min — faixa de horário de abertura de clube/federação. */
const START_TIME_OPTIONS = Array.from({ length: (22 - 6) * 2 + 1 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30;
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}`;
});

const schema = z.object({
  name:            z.string().min(3, 'Nome muito curto'),
  description:     z.string().optional(),
  city:            z.string().min(2, 'Cidade obrigatória'),
  state:           z.string().length(2, 'Selecione um estado'),
  venue:           z.string().optional(),
  organizer_name:  z.string().min(2, 'Nome do organizador obrigatório'),
  chief_arbiter:   z.string().optional(),
  time_control:    z.string().min(2, 'Ritmo obrigatório'),
  time_control_kind: z.enum(['bullet', 'blitz', 'rapid', 'classical', 'other']),
  tournament_type: z.enum(['swiss', 'round_robin']),
  start_date:      z.string().min(1, 'Data de início obrigatória'),
  start_time:      z.string().optional(),
  end_date:        z.string().optional(),
  registration_start_date: z.string().optional(),
  registration_end_date:   z.string().optional(),
  rounds_count:    z.coerce.number().int().min(1).max(20),
  is_public:       z.boolean(),
  mode:            z.enum(['native', 'imported']),
  initial_color:   z.enum(['white1', 'black1']),
  rating_kind:     z.enum(['std', 'rpd', 'blz']),
  requested_bye_score: z.coerce.number(),
  tiebreak_order: z.array(z.enum(['buchholz', 'buchholz_cut1', 'sonneborn_berger', 'wins', 'progressive'])),
  require_payment_receipt: z.boolean(),
  registration_fee_text: z.string().optional(),
  is_free: z.boolean({ required_error: 'Responda se a inscrição é gratuita' }),
  require_cbx_id: z.boolean(),
}).superRefine((values, ctx) => {
  if (values.registration_start_date && values.registration_end_date
    && values.registration_end_date < values.registration_start_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registration_end_date'],
      message: 'Encerramento das inscrições deve ser após o início das inscrições',
    });
  }

  if (values.registration_end_date && values.start_date
    && values.registration_end_date > values.start_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registration_end_date'],
      message: 'Inscrições devem encerrar até a data de início do torneio',
    });
  }
});

/** Converte null -> undefined em todo o objeto (ver comentário de uso abaixo). */
function stripNulls<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === null ? undefined : v;
  return out;
}

/**
 * Ordem visual dos campos que podem falhar validação — usada pra rolar até o
 * PRIMEIRO erro num submit inválido. is_free não é um input registrado (são
 * chips via setValue), então tem data-field no wrapper.
 */
const FIELD_ORDER: Array<keyof TournamentFormValues> = [
  'name', 'city', 'state', 'organizer_name', 'rounds_count',
  'time_control', 'start_date', 'registration_start_date', 'registration_end_date',
  'is_free',
];

const FIELD_LABELS: Partial<Record<keyof TournamentFormValues, string>> = {
  name: 'Nome do torneio',
  city: 'Cidade',
  state: 'Estado',
  organizer_name: 'Organizador',
  rounds_count: 'Número de rodadas',
  time_control: 'Ritmo de jogo',
  start_date: 'Data de início',
  registration_start_date: 'Início das inscrições',
  registration_end_date: 'Encerramento das inscrições',
  is_free: 'Inscrição gratuita',
};

interface Props {
  defaultValues?: Partial<TournamentFormValues>;
  onSubmit: (values: TournamentFormValues) => void;
  loading?: boolean;
  submitLabel?: string;
  /**
   * Quando informado, o form ganha esse id e NÃO renderiza o próprio botão
   * de salvar — quem chama coloca um `<Button type="submit" form={formId}>`
   * onde quiser (fora do form, inclusive), via o atributo HTML5 `form`. Usado
   * em edit/page.tsx pra deixar o salvar depois de Classificação e
   * Emparceiramento, que ficam fora deste componente.
   */
  formId?: string;
}

export function TournamentForm({ defaultValues, onSubmit, loading, submitLabel = 'Salvar', formId }: Props) {
  const {
    register, handleSubmit, watch, setValue, getValues,
    formState: { errors, isSubmitted },
  } = useForm<TournamentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tournament_type: 'swiss',
      rounds_count: 6,
      is_public: true,
      mode: 'native',
      rating_kind: 'std',
      time_control_kind: 'other',
      requested_bye_score: 0.5,
      tiebreak_order: ['buchholz', 'buchholz_cut1', 'sonneborn_berger'],
      require_payment_receipt: false,
      require_cbx_id: false,
      // Sem default de propósito — obriga o organizador a responder em vez
      // de herdar "gratuito" silenciosamente (ver zod required_error acima).
      is_free: undefined as unknown as boolean,
      // stripNulls: defaultValues vem direto da linha do banco (edit/page.tsx
      // passa o torneio inteiro) — colunas opcionais sem valor chegam como
      // null, mas o schema só aceita string | undefined nesses campos
      // (z.string().optional() rejeita null). Sem isso, editar um torneio
      // sem data de inscrição preenchida, por exemplo, falhava a validação
      // sem nenhum aviso visível e "Salvar alterações" nunca completava.
      ...stripNulls(defaultValues),
      initial_color: 'white1',
    },
  });

  const isFree = watch('is_free');
  const requireCbxId = watch('require_cbx_id');

  // Estado do select de ritmo: valor do preset, sentinela "Outro" ou vazio.
  const initialPreset = findPresetByValue(defaultValues?.time_control);
  const [tcChoice, setTcChoice] = useState<string>(
    initialPreset ? initialPreset.value
      : defaultValues?.time_control ? TIME_CONTROL_OTHER
      : ''
  );
  const isOtherTc = tcChoice === TIME_CONTROL_OTHER;
  // Enquanto o organizador não trocar o rating na mão, o preset de ritmo
  // sugere o rating de seed. Depois de um ajuste manual, para de sugerir.
  const [ratingTouched, setRatingTouched] = useState(false);

  function onTcChange(choice: string) {
    setTcChoice(choice);
    if (choice === TIME_CONTROL_OTHER) {
      setValue('time_control', '', { shouldDirty: true });
      setValue('time_control_kind', 'other', { shouldDirty: true });
      return;
    }
    const preset = TIME_CONTROL_PRESETS.find((p) => p.value === choice);
    if (!preset) return;
    setValue('time_control', preset.value, { shouldDirty: true, shouldValidate: true });
    setValue('time_control_kind', preset.kind, { shouldDirty: true });
    if (!ratingTouched) {
      setValue('rating_kind', preset.suggestedRatingKind, { shouldDirty: true });
    }
  }

  const erroredFields = FIELD_ORDER.filter((f) => errors[f]);

  function scrollToField(field: keyof TournamentFormValues) {
    if (typeof document === 'undefined') return;
    const el = document.querySelector<HTMLElement>(
      `[name="${field}"], [data-field="${field}"]`
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof (el as HTMLInputElement).focus === 'function') {
      try { (el as HTMLInputElement).focus({ preventScroll: true }); } catch { el.focus(); }
    }
  }

  function onInvalid() {
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (first) scrollToField(first);
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit((values) => {
        const payload: TournamentFormValues = {
          ...values,
          start_time: values.start_time || undefined,
          end_date: values.end_date || undefined,
          registration_start_date: values.registration_start_date || undefined,
          registration_end_date: values.registration_end_date || undefined,
        };
        onSubmit(payload);
      }, onInvalid)}
      className="space-y-5"
    >
      {isSubmitted && erroredFields.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            {erroredFields.length} campo{erroredFields.length > 1 ? 's precisam' : ' precisa'} de atenção.
          </p>
          <button
            type="button"
            onClick={() => scrollToField(erroredFields[0])}
            className="mt-1 text-sm text-red-600 underline hover:text-red-700 dark:text-red-400"
          >
            Ir para {FIELD_LABELS[erroredFields[0]] ?? 'o primeiro erro'}
          </button>
        </div>
      )}

      {/* Basic info */}
      <div className="card p-5 space-y-4" data-tour="info-basica">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Informações básicas</h2>
        <Input label="Nome do torneio *" error={errors.name?.message} {...register('name')} />
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
            Descrição
          </label>
          <textarea
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            rows={3}
            placeholder="Informações sobre categorias, premiação, etc."
            {...register('description')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Cidade *" error={errors.city?.message} {...register('city')} />
          <Select label="Estado *" error={errors.state?.message} {...register('state')}>
            <option value="">Selecionar...</option>
            {BR_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.uf}</option>)}
          </Select>
        </div>
        <Input label="Local (endereço/clube)" {...register('venue')} />
      </div>

      {/* Organizer */}
      <div className="card p-5 space-y-4" data-tour="organizacao">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Organização</h2>
        <Input label="Organizador *" error={errors.organizer_name?.message} {...register('organizer_name')} />
        <Input label="Árbitro-chefe" {...register('chief_arbiter')} />
      </div>

      {/* Format */}
      <div className="card p-5 space-y-4" data-tour="formato">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Formato</h2>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Sistema *" {...register('tournament_type')}>
            <option value="swiss">Suíço</option>
            <option value="round_robin">Todos contra todos</option>
          </Select>
          <Input
            label="Número de rodadas *"
            type="number"
            min={1}
            max={20}
            error={errors.rounds_count?.message}
            {...register('rounds_count')}
          />
        </div>

        <div data-field="time_control">
          <Select
            label="Ritmo de jogo *"
            value={tcChoice}
            onChange={(e) => onTcChange(e.target.value)}
          >
            <option value="">Selecionar...</option>
            {TIME_CONTROL_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
            <option value={TIME_CONTROL_OTHER}>Outro (personalizado)</option>
          </Select>
          {isOtherTc && (
            <div className="mt-3">
              <Input
                label="Ritmo personalizado *"
                placeholder='Ex: G/30+10 ou 90"+30"'
                error={errors.time_control?.message}
                hint="Use notação padrão, ex: G/30+10 (30 min + 10 seg por lance)"
                {...register('time_control')}
              />
            </div>
          )}
          {!isOtherTc && errors.time_control && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.time_control.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Data de início *" type="date" error={errors.start_date?.message}
            {...register('start_date', {
              // Maioria dos torneios começa e termina no mesmo dia — só
              // preenche sozinho enquanto o organizador não mexeu no campo
              // de encerramento (não sobrescreve escolha manual).
              onChange: (e) => {
                if (!getValues('end_date')) setValue('end_date', e.target.value);
              },
            })}
          />
          <Input label="Data de encerramento" type="date" {...register('end_date')} />
        </div>
        <Select label="Horário de início (opcional)" {...register('start_time')}>
          <option value="">Não informado</option>
          {START_TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Período de inscrições</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Início"
              type="date"
              error={errors.registration_start_date?.message}
              {...register('registration_start_date')}
            />
            <Input
              label="Encerramento"
              type="date"
              error={errors.registration_end_date?.message}
              {...register('registration_end_date')}
            />
          </div>
        </div>
      </div>

      {/* Gerenciamento — antes de Cobrança: são as decisões de operação do
          torneio (rating de seed, desempate, exigência de ID). O modo do
          torneio (nativo/importado) é implícito: toda criação é nativa. */}
      <div className="card p-5 space-y-4" data-tour="gerenciamento">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Gerenciamento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Rating para seed"
            {...register('rating_kind', { onChange: () => setRatingTouched(true) })}
          >
            <option value="std">Clássico</option>
            <option value="rpd">Rápido</option>
            <option value="blz">Blitz</option>
          </Select>
          <Select label="Bye solicitado vale" {...register('requested_bye_score')}>
            <option value="0.5">½ ponto</option>
            <option value="0">0 pontos</option>
          </Select>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {!ratingTouched && tcChoice && tcChoice !== TIME_CONTROL_OTHER
            ? 'Rating sugerido pelo ritmo — pode trocar. '
            : ''}
          Podem ser editadas até a 1ª rodada ser publicada.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          O rating dos participantes é preenchido automaticamente pelo ID CBX da inscrição — não precisa digitar.
          {!requireCbxId && ' Sem ID CBX, o rating fica em branco até você preencher em Participantes.'}
        </p>
        <TiebreakOrderPicker
          value={watch('tiebreak_order') as TiebreakKey[]}
          onChange={(v) => setValue('tiebreak_order', v, { shouldDirty: true })}
        />
        <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-gray-100 dark:border-gray-800">
          <input
            type="checkbox"
            className="h-4 w-4 mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            {...register('require_cbx_id')}
          />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">ID CBX obrigatório</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              A inscrição pública só é aceita com o ID CBX preenchido.
            </p>
          </div>
        </label>
      </div>

      {/* Cobrança — card próprio, depois de Gerenciamento. */}
      <div className="card p-5 space-y-3" data-tour="pergunta-gratuita" data-field="is_free">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Cobrança</h2>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Seu torneio tem inscrição gratuita?</p>
          <div className="flex gap-1.5 shrink-0">
            <Chip
              active={isFree === true}
              onClick={() => {
                setValue('is_free', true, { shouldDirty: true, shouldValidate: true });
                setValue('require_payment_receipt', false, { shouldDirty: true });
              }}
            >
              Sim
            </Chip>
            <Chip
              active={isFree === false}
              onClick={() => setValue('is_free', false, { shouldDirty: true, shouldValidate: true })}
            >
              Não
            </Chip>
          </div>
        </div>
        {errors.is_free && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.is_free.message}</p>
        )}
        {isFree === false && (
          <div className="space-y-4 pt-1">
            <Input
              label="Valor da inscrição"
              placeholder='Ex: R$50 (Absoluto) / R$30 (Sub-14)'
              {...register('registration_fee_text')}
            />
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                {...register('require_payment_receipt')}
              />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">Exigir comprovante de pagamento</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  A inscrição só é aceita com o comprovante anexado.
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Visibility */}
      <div className="card p-5" data-tour="visibilidade">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            {...register('is_public')}
          />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">Torneio público</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Torneios públicos aparecem na listagem e podem ser acessados sem login.
            </p>
          </div>
        </label>
      </div>

      {!formId && (
        <div data-tour="criar">
          <Button type="submit" loading={loading} size="lg" className="w-full sm:w-auto">
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Mesmo estilo das perguntas Sim/Não da tela de Classificação (groups/page.tsx). */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
