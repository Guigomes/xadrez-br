'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useProfile, useUpdateMyCapabilities } from '@/lib/hooks/use-auth';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: loadingUser } = useUser();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const updateCapabilities = useUpdateMyCapabilities();

  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isArbiter, setIsArbiter] = useState(false);
  const [isParticipant, setIsParticipant] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      setIsOrganizer(profile.is_organizer);
      setIsArbiter(profile.is_arbiter);
      setIsParticipant(profile.is_participant);
    }
  }, [profile]);

  useEffect(() => {
    if (!loadingUser && !user) router.push('/login');
  }, [loadingUser, user, router]);

  if (loadingUser || loadingProfile || !profile) return <PageSpinner />;

  async function handleSave() {
    setError('');
    setSaved(false);
    if (!isOrganizer && !isArbiter && !isParticipant) {
      setError('Mantenha pelo menos uma opção marcada: organizador, árbitro ou participante.');
      return;
    }
    try {
      await updateCapabilities.mutateAsync({ isOrganizer, isArbiter, isParticipant });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar.');
    }
  }

  return (
    <div className="container-app py-8 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Minha conta</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{profile.full_name || profile.email}</p>

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">O que você faz aqui</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            As três podem estar ativas ao mesmo tempo, mas é preciso manter pelo menos uma marcada.
            Inscrever-se para jogar um torneio não exige nenhuma delas.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isOrganizer}
            onChange={(e) => setIsOrganizer(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Organizador</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Pode criar e gerenciar torneios.</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isArbiter}
            onChange={(e) => setIsArbiter(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Árbitro</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pode cadastrar jogadores e ser adicionado à equipe de torneios de outros organizadores.
            </p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isParticipant}
            onChange={(e) => setIsParticipant(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Participante</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Não é preciso estar cadastrado para jogar — a inscrição já é aberta a qualquer pessoa.
              Serve só para ter seus dados reaproveitados e a inscrição preenchida automaticamente
              num próximo torneio.
            </p>
          </div>
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} loading={updateCapabilities.isPending}>
            Salvar
          </Button>
          {saved && (
            <span className="text-sm font-medium text-green-600 dark:text-green-400 animate-pulse">
              ✓ Salvo
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
