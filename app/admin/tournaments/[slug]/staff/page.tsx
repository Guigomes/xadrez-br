'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useTournament } from '@/lib/hooks/use-tournament';
import { useStaff, useAddStaff, useRemoveStaff, useMyTournamentRole } from '@/lib/hooks/use-staff';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { StaffRole } from '@/types/database';

export default function AdminStaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);
  const { data: staff, isLoading: loadingStaff } = useStaff(tournament?.id ?? '');
  const { data: myRole } = useMyTournamentRole(tournament?.id ?? '');
  const addStaff = useAddStaff(tournament?.id ?? '');
  const removeStaff = useRemoveStaff(tournament?.id ?? '');

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('arbiter');
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  const isOrganizer = myRole === 'organizer';

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await addStaff.mutateAsync({ email: email.trim(), role });
      setEmail('');
    } catch (err: any) {
      setError(err.message?.includes('USER_NOT_FOUND')
        ? 'Nenhuma conta com este e-mail — peça para a pessoa se cadastrar primeiro.'
        : err.message ?? 'Erro ao adicionar');
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{tournament.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Equipe do torneio</p>
        </div>
        <Link
          href={`/admin/tournaments/${slug}/rounds`}
          className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          ← Rodadas
        </Link>
      </div>

      {isOrganizer && (
        <form onSubmit={handleAdd} className="card p-4 mb-6 space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Adicionar membro</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Input
              type="email" required placeholder="email@dacontaexistente.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="arbiter">Árbitro</option>
              <option value="organizer">Organizador</option>
            </Select>
            <Button type="submit" loading={addStaff.isPending}>Adicionar</Button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Organizadores: gerenciam tudo. Árbitros: pareiam rodadas e lançam resultados
            (nas mesas atribuídas a eles, quando houver atribuição).
          </p>
        </form>
      )}

      {loadingStaff ? (
        <PageSpinner />
      ) : !staff?.length ? (
        <EmptyState icon="👥" title="Nenhum membro além do dono"
          description={isOrganizer ? 'Adicione organizadores e árbitros acima.' : undefined} />
      ) : (
        <div className="space-y-2">
          {staff.map((s) => (
            <div key={s.id} className="card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  {s.full_name || s.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={s.role === 'organizer'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}>
                  {s.role === 'organizer' ? 'Organizador' : 'Árbitro'}
                </Badge>
                {isOrganizer && (
                  <Button variant="ghost" size="sm" loading={removeStaff.isPending}
                    onClick={() => removeStaff.mutate(s.id)}>
                    Remover
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
