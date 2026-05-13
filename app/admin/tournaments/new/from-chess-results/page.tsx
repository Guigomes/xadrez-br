'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/lib/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { slugify } from '@/lib/utils/chess';
import { TournamentForm } from '@/components/tournament/tournament-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import type { TournamentFormValues } from '@/types/database';
import type { ChessResultsPreview } from '@/app/api/admin/chess-results-preview/route';

type Step = 'url' | 'preview' | 'saving';

export default function NewFromChessResultsPage() {
  const router = useRouter();
  const { user } = useUser();

  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [preview, setPreview] = useState<ChessResultsPreview | null>(null);
  const [saveError, setSaveError] = useState('');

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setFetching(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/admin/chess-results-preview?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido');
      setPreview(data);
      setStep('preview');
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setFetching(false);
    }
  }

  async function handleCreate(values: TournamentFormValues) {
    if (!user) return;
    setStep('saving');
    setSaveError('');
    try {
      const supabase = createClient();
      const slug = slugify(values.name) + '-' + values.start_date.replace(/-/g, '');

      const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .insert({ ...values, slug, created_by: user.id })
        .select()
        .single();
      if (tErr) throw tErr;

      await supabase.from('tournament_imports').insert({
        tournament_id: tournament.id,
        base_url: url.trim(),
        pairing_group_name: null,
        enabled: true,
      });

      router.push(`/admin/tournaments/${slug}/imports`);
    } catch (err: any) {
      setSaveError(err.message ?? 'Erro ao criar torneio.');
      setStep('preview');
    }
  }

  // Build defaultValues from parsed preview
  const defaultValues: Partial<TournamentFormValues> = preview ? {
    name:           preview.name,
    city:           preview.city,
    state:          '',
    start_date:     preview.startDate,
    end_date:       preview.endDate || undefined,
    rounds_count:   preview.roundsCount || 7,
    chief_arbiter:  preview.chiefArbiter || undefined,
    organizer_name: preview.organizerName || '',
    time_control:   preview.timeControl || '',
    tournament_type: 'swiss',
    is_public: false,
  } : {};

  if (step === 'saving') return <PageSpinner />;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Novo torneio via chess-results
          </h1>
          {step === 'preview' && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Revise os dados extraídos e preencha os campos em falta antes de criar.
            </p>
          )}
        </div>
        <Link
          href="/admin/tournaments/new"
          className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
        >
          ← Criar manualmente
        </Link>
      </div>

      {/* Step 1: URL input */}
      <div className={`card p-4 mb-6 ${step === 'preview' ? 'opacity-60' : ''}`}>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          URL do torneio no chess-results
        </p>
        <form onSubmit={step === 'url' ? handleFetch : (e) => { e.preventDefault(); setStep('url'); setPreview(null); }} className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="https://chess-results.com/tnr123456.aspx?lan=10"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={fetching || step === 'preview'}
          />
          {step === 'url' ? (
            <Button type="submit" loading={fetching} disabled={!url.trim()}>
              Buscar
            </Button>
          ) : (
            <Button type="submit" variant="secondary">
              Alterar
            </Button>
          )}
        </form>
        {fetchError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{fetchError}</p>
        )}
      </div>

      {/* Step 2: editable form */}
      {step === 'preview' && preview && (
        <>
          {saveError && (
            <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {saveError}
            </p>
          )}
          <TournamentForm
            defaultValues={defaultValues}
            onSubmit={handleCreate}
            submitLabel="Criar torneio e configurar importação"
          />
        </>
      )}
    </div>
  );
}
