'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BR_STATES } from '@/lib/utils/chess';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v);

const schema = z.object({
  full_name:  z.string().min(5, 'Informe o nome completo'),
  birth_year: z.preprocess(emptyToUndef,
    z.coerce.number().int().min(1900, 'Ano inválido').max(CURRENT_YEAR, 'Ano inválido').optional()),
  city:       z.string().optional(),
  state:      z.string().optional(),
  club_or_school: z.string().optional(),
  federation: z.string().length(3, 'Use a sigla de 3 letras (ex: BRA)').default('BRA'),
  fide_id:    z.string().regex(/^\d*$/, 'Apenas números').optional(),
  cbx_id:     z.string().regex(/^\d*$/, 'Apenas números').optional(),
  email:      z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone:      z.string().optional(),
  pairing_group_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface AutofillData {
  full_name: string;
  email: string | null;
  birth_year: number | null;
  city: string | null;
  state: string | null;
  club_or_school: string | null;
  federation: string;
  fide_id: string | null;
  cbx_id: string | null;
  phone: string | null;
}

interface Props {
  tournamentId: string;
  tournamentSlug: string;
  groups: { id: string; name: string }[];
  requirePaymentReceipt?: boolean;
  registrationFeeText?: string | null;
  isFree?: boolean;
  /** Dados do perfil de quem está logado e marcou "participante" — usados para pré-preencher o formulário. */
  autofill?: AutofillData | null;
  /** Se true, a inscrição enviada é salva de volta no perfil para alimentar o autopreenchimento da próxima vez. */
  saveAutofillOnSubmit?: boolean;
}

export function RegistrationForm({
  tournamentId, tournamentSlug, groups,
  requirePaymentReceipt = false, registrationFeeText, isFree = false,
  autofill, saveAutofillOnSubmit = false,
}: Props) {
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: autofill?.full_name || '',
      birth_year: autofill?.birth_year ?? undefined,
      city: autofill?.city || '',
      state: autofill?.state || '',
      club_or_school: autofill?.club_or_school || '',
      federation: autofill?.federation || 'BRA',
      fide_id: autofill?.fide_id || '',
      cbx_id: autofill?.cbx_id || '',
      email: autofill?.email || '',
      phone: autofill?.phone || '',
      pairing_group_id: groups.length === 1 ? groups[0].id : undefined,
    },
  });

  function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    setReceiptError('');
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_RECEIPT_BYTES) {
      setReceiptError('Arquivo muito grande (máximo 5 MB).');
      setReceipt(null);
      return;
    }
    if (file && !RECEIPT_TYPES.includes(file.type)) {
      setReceiptError('Formato não suportado (use JPG, PNG, WebP ou PDF).');
      setReceipt(null);
      return;
    }
    setReceipt(file);
  }

  async function onSubmit(values: FormValues) {
    if (groups.length > 1 && !values.pairing_group_id) {
      setError('Selecione o grupo em que deseja jogar.');
      return;
    }
    if (!isFree && requirePaymentReceipt && !receipt) {
      setError('Este torneio exige o comprovante de pagamento para concluir a inscrição.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const supabase = createClient();

      let payment_receipt_path: string | null = null;
      if (receipt) {
        const ext = receipt.name.split('.').pop()?.toLowerCase() ?? 'bin';
        const path = `${tournamentId}/${crypto.randomUUID()}.${ext}`;
        const { data, error: upErr } = await supabase.storage
          .from('payment-receipts')
          .upload(path, receipt, { contentType: receipt.type });
        if (upErr) throw new Error(`Falha ao enviar comprovante: ${upErr.message}`);
        payment_receipt_path = data.path;
      }

      const { error: insErr } = await supabase.from('tournament_registrations').insert({
        tournament_id: tournamentId,
        pairing_group_id: values.pairing_group_id || null,
        full_name: values.full_name.trim(),
        birth_year: values.birth_year ?? null,
        city: values.city?.trim() || null,
        state: values.state || null,
        club_or_school: values.club_or_school?.trim() || null,
        federation: values.federation.toUpperCase(),
        fide_id: values.fide_id || null,
        cbx_id: values.cbx_id || null,
        email: values.email || null,
        phone: values.phone?.trim() || null,
        payment_receipt_path,
      });
      if (insErr) {
        if (insErr.message.includes('row-level security')) {
          throw new Error('As inscrições não estão abertas para este torneio.');
        }
        if (insErr.message.includes('PAYMENT_RECEIPT_REQUIRED')) {
          throw new Error('Este torneio exige o comprovante de pagamento para concluir a inscrição.');
        }
        throw insErr;
      }

      if (saveAutofillOnSubmit) {
        // Melhor esforço: a inscrição já foi enviada com sucesso, então uma
        // falha aqui não deve impedir a confirmação nem virar erro pro usuário.
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('user_profiles').update({
              full_name: values.full_name.trim(),
              birth_year: values.birth_year ?? null,
              city: values.city?.trim() || null,
              state: values.state || null,
              club_or_school: values.club_or_school?.trim() || null,
              federation: values.federation.toUpperCase(),
              fide_id: values.fide_id || null,
              cbx_id: values.cbx_id || null,
              phone: values.phone?.trim() || null,
            }).eq('id', user.id);
          }
        } catch {
          // ignora — a inscrição em si já foi confirmada
        }
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao enviar inscrição.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="card p-6 text-center space-y-3">
        <span className="text-4xl">✅</span>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Inscrição enviada!
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sua inscrição foi recebida e está aguardando a confirmação da organização.
          Você aparecerá na lista de participantes assim que for aprovada.
        </p>
        <Link
          href={`/tournaments/${tournamentSlug}`}
          className="inline-block text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
        >
          ← Voltar ao torneio
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Dados do jogador</h2>
        <Input label="Nome completo *" placeholder="Como consta na CBX/FIDE" {...register('full_name')} error={errors.full_name?.message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Ano de nascimento" type="number" inputMode="numeric" placeholder="2010" {...register('birth_year')} error={errors.birth_year?.message} />
          <Input label="Cidade" placeholder="Sua cidade" {...register('city')} error={errors.city?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="UF" {...register('state')} defaultValue="">
            <option value="">Selecione…</option>
            {BR_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>)}
          </Select>
          <Input label="Escola / clube de xadrez" placeholder="Opcional" {...register('club_or_school')} error={errors.club_or_school?.message} />
        </div>
        {groups.length > 1 && (
          <Select label="Grupo *" {...register('pairing_group_id')} error={errors.pairing_group_id?.message} defaultValue="">
            <option value="" disabled>Selecione o grupo…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Registros</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          Preencha se tiver — a organização confirma seu rating a partir do ID.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="ID CBX" inputMode="numeric" {...register('cbx_id')} error={errors.cbx_id?.message} />
          <Input label="ID FIDE" inputMode="numeric" {...register('fide_id')} error={errors.fide_id?.message} />
        </div>
        <Input label="Federação" maxLength={3} {...register('federation')} error={errors.federation?.message} hint="Sigla de 3 letras. Padrão: BRA" />
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Contato</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          Visível apenas para a organização do torneio.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="E-mail" type="email" placeholder="voce@exemplo.com" {...register('email')} error={errors.email?.message} />
          <Input label="Telefone / WhatsApp" type="tel" placeholder="(11) 99999-9999" {...register('phone')} error={errors.phone?.message} />
        </div>
      </div>

      {!isFree && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            Comprovante de pagamento{requirePaymentReceipt && ' *'}
          </h2>
          {registrationFeeText && (
            <p className="text-sm text-gray-700 dark:text-gray-300 -mt-1">
              💰 Valor da inscrição: <strong>{registrationFeeText}</strong>
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
            {requirePaymentReceipt
              ? 'Obrigatório para esta inscrição — anexe o comprovante (JPG, PNG ou PDF, até 5 MB).'
              : 'Se o torneio exige taxa de inscrição, anexe o comprovante (JPG, PNG ou PDF, até 5 MB).'}
          </p>
          <input
            type="file"
            accept={RECEIPT_TYPES.join(',')}
            onChange={handleReceiptChange}
            className="block w-full text-sm text-gray-600 dark:text-gray-400
              file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2
              file:text-sm file:font-medium file:text-brand-700
              dark:file:bg-brand-950/50 dark:file:text-brand-300"
          />
          {receiptError && <p className="text-xs text-red-600 dark:text-red-400">{receiptError}</p>}
          {receipt && !receiptError && (
            <p className="text-xs text-green-600 dark:text-green-400">📎 {receipt.name}</p>
          )}
        </div>
      )}

      <Button type="submit" size="lg" loading={submitting} className="w-full">
        Enviar inscrição
      </Button>
    </form>
  );
}
