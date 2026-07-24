'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { TiebreakOrderPicker } from '@/components/tournament/tiebreak-order-picker';
import { BR_STATES, slugify } from '@/lib/utils/chess';
import type { TournamentFormValues, Tournament, TiebreakKey } from '@/types/database';

const schema = z.object({
  name:            z.string().min(3, 'Nome muito curto'),
  description:     z.string().optional(),
  city:            z.string().min(2, 'Cidade obrigatória'),
  state:           z.string().length(2, 'Selecione um estado'),
  venue:           z.string().optional(),
  organizer_name:  z.string().min(2, 'Nome do organizador obrigatório'),
  chief_arbiter:   z.string().optional(),
  time_control:    z.string().min(2, 'Ritmo obrigatório'),
  tournament_type: z.enum(['swiss', 'round_robin', 'knockout', 'other']),
  start_date:      z.string().min(1, 'Data de início obrigatória'),
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
  is_free: z.boolean(),
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

export interface GroupDraft {
  name: string;
  rounds_count: string;
}

interface Props {
  defaultValues?: Partial<TournamentFormValues>;
  onSubmit: (values: TournamentFormValues, groups?: GroupDraft[]) => void;
  loading?: boolean;
  submitLabel?: string;
  /** Mostra a seção opcional de grupos (só faz sentido na criação). */
  showGroups?: boolean;
}

export function TournamentForm({ defaultValues, onSubmit, loading, submitLabel = 'Salvar', showGroups = false }: Props) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<TournamentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tournament_type: 'swiss',
      rounds_count: 7,
      is_public: false,
      mode: 'native',
      rating_kind: 'std',
      requested_bye_score: 0.5,
      tiebreak_order: ['buchholz', 'buchholz_cut1', 'sonneborn_berger'],
      require_payment_receipt: false,
      is_free: false,
      ...defaultValues,
      initial_color: 'white1',
    },
  });

  const isFree = watch('is_free');
  const [groups, setGroups] = useState<GroupDraft[]>([]);

  const addGroup = () => setGroups((g) => [...g, { name: '', rounds_count: '' }]);
  const removeGroup = (i: number) => setGroups((g) => g.filter((_, idx) => idx !== i));
  const updateGroup = (i: number, patch: Partial<GroupDraft>) =>
    setGroups((g) => g.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <form
      onSubmit={handleSubmit((values) => {
        const payload: TournamentFormValues = {
          ...values,
          end_date: values.end_date || undefined,
          registration_start_date: values.registration_start_date || undefined,
          registration_end_date: values.registration_end_date || undefined,
        };
        const cleanGroups = groups
          .map((g) => ({ name: g.name.trim(), rounds_count: g.rounds_count }))
          .filter((g) => g.name.length > 0);
        onSubmit(payload, showGroups ? cleanGroups : undefined);
      })}
      className="space-y-5"
    >
      {/* Basic info */}
      <div className="card p-5 space-y-4">
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
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Organização</h2>
        <Input label="Organizador *" error={errors.organizer_name?.message} {...register('organizer_name')} />
        <Input label="Árbitro-chefe" {...register('chief_arbiter')} />
      </div>

      {/* Format */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Formato</h2>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Sistema *" {...register('tournament_type')}>
            <option value="swiss">Suíço</option>
            <option value="round_robin">Todos contra todos</option>
            <option value="knockout">Eliminatório</option>
            <option value="other">Outro</option>
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
        <Input
          label="Ritmo de jogo *"
          placeholder='Ex: G/30+10 ou 90"+30"'
          error={errors.time_control?.message}
          hint="Use notação padrão, ex: G/30+10 (30 min + 10 seg por lance)"
          {...register('time_control')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Data de início *" type="date" error={errors.start_date?.message} {...register('start_date')} />
          <Input label="Data de encerramento" type="date" {...register('end_date')} />
        </div>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Período de inscrições</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Inscrições: início"
              type="date"
              error={errors.registration_start_date?.message}
              {...register('registration_start_date')}
            />
            <Input
              label="Inscrições: encerramento"
              type="date"
              error={errors.registration_end_date?.message}
              {...register('registration_end_date')}
            />
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Cobrança</p>
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <input
              type="checkbox"
              className="h-4 w-4 mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              {...register('is_free')}
              onChange={(e) => {
                setValue('is_free', e.target.checked, { shouldDirty: true });
                if (e.target.checked) setValue('require_payment_receipt', false, { shouldDirty: true });
              }}
            />
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">Torneio gratuito</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Sem taxa de inscrição.
              </p>
            </div>
          </label>
          {!isFree && (
            <div className="mt-4 space-y-4">
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
      </div>

      {/* Native pairing config — o modo do torneio (nativo/importado) é
          implícito: toda criação é nativa. "Importado" existe só para uso
          interno (painel de desenvolvedor), fora deste formulário. */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Gerenciamento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Rating para seed" {...register('rating_kind')}>
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
          Podem ser editadas até a 1ª rodada ser publicada.
        </p>
        <TiebreakOrderPicker
          value={watch('tiebreak_order') as TiebreakKey[]}
          onChange={(v) => setValue('tiebreak_order', v, { shouldDirty: true })}
        />
      </div>

      {/* Grupos de emparceiramento (opcional, só na criação) */}
      {showGroups && (
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Grupos de emparceiramento</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Opcional. Crie divisões que pareiam separadamente (ex: Absoluto, Sub-14, Feminino).
              Deixe vazio para usar um grupo único. Você também pode gerenciar isso depois na aba Grupos.
            </p>
          </div>

          {groups.length > 0 && (
            <div className="space-y-2">
              {groups.map((g, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label={i === 0 ? 'Nome do grupo' : undefined}
                      placeholder="Ex: Absoluto"
                      value={g.name}
                      onChange={(e) => updateGroup(i, { name: e.target.value })}
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      label={i === 0 ? 'Rodadas' : undefined}
                      type="number"
                      min={1}
                      max={20}
                      placeholder="herda"
                      value={g.rounds_count}
                      onChange={(e) => updateGroup(i, { rounds_count: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGroup(i)}
                    className="mb-1 rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-10 text-sm text-gray-500 hover:text-red-600 dark:text-gray-400"
                    aria-label="Remover grupo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button type="button" variant="secondary" size="sm" onClick={addGroup}>
            + Adicionar grupo
          </Button>
        </div>
      )}

      {/* Visibility */}
      <div className="card p-5">
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

      <Button type="submit" loading={loading} size="lg" className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
}
