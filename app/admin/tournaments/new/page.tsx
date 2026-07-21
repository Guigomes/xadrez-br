'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TournamentForm } from '@/components/tournament/tournament-form';
import { slugify } from '@/lib/utils/chess';
import type { TournamentFormValues } from '@/types/database';
import { useState } from 'react';
import { useUser } from '@/lib/hooks/use-auth';

export default function NewTournamentPage() {
  const router = useRouter();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(values: TournamentFormValues) {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const slug = slugify(values.name) + '-' + values.start_date.replace(/-/g, '');
      // Torneio criado por aqui é sempre nativo — modo não é escolha do
      // organizador (torneios importados só existem via painel de dev).
      const { data, error: err } = await supabase
        .from('tournaments')
        .insert({ ...values, mode: 'native', slug, created_by: user.id })
        .select()
        .single();
      if (err) throw err;
      router.push('/admin');
    } catch (err: any) {
      setError(err.message ?? 'Erro ao criar torneio.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
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
