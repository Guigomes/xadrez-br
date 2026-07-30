'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TournamentForm } from '@/components/tournament/tournament-form';
import { TourTriggerButton } from '@/components/admin/tour-trigger-button';
import { PageSpinner } from '@/components/ui/spinner';
import { slugify } from '@/lib/utils/chess';
import type { TournamentFormValues } from '@/types/database';
import { useState } from 'react';
import { useUser, useProfile } from '@/lib/hooks/use-auth';

export default function NewTournamentPage() {
  const router = useRouter();
  const { user } = useUser();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canCreate = profile?.role === 'admin' || !!profile?.is_organizer;

  useEffect(() => {
    if (!loadingProfile && profile && !canCreate) router.replace('/admin');
  }, [loadingProfile, profile, canCreate, router]);

  if (loadingProfile || !profile || !canCreate) return <PageSpinner />;

  async function handleSubmit(values: TournamentFormValues) {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const slug = slugify(values.name) + '-' + values.start_date.replace(/-/g, '');
      // Torneio criado por aqui é sempre nativo — modo não é escolha do
      // organizador (torneios importados só existem via painel de dev).
      const { error: err } = await supabase
        .from('tournaments')
        .insert({ ...values, mode: 'native', slug, created_by: user.id });
      if (err) throw err;
      // Leva direto para o setup de classificações/emparceiramento —
      // sem isso o organizador não teria como descobrir essa etapa.
      router.push(`/admin/tournaments/${slug}/groups`);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao criar torneio.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <TourTriggerButton
          stepId="info-basica"
          label="❔ Dicas de como criar um torneio"
          className="mb-2 inline-flex rounded-full bg-brand-50 dark:bg-brand-950/50 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/60 transition-colors"
        />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Novo torneio</h1>
      </div>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <TournamentForm onSubmit={handleSubmit} loading={loading} submitLabel="Criar torneio" />
    </div>
  );
}
