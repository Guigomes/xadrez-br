import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { RegistrationForm } from './registration-form';

export const metadata: Metadata = { title: 'Inscrição', robots: { index: false } };

interface Props {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Inscrição num torneio organizado pelo app Gambito Torneios (link que o organizador compartilha). */
export default async function LiteRegistrationPage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const admin = createAdminClient();
  const { data: t } = await admin
    .from('lite_tournaments')
    .select('id, name, owner_id, registration_open')
    .eq('id', id)
    .maybeSingle();
  if (!t) notFound();
  // owner_id aponta para auth.users: sem FK com user_profiles, o nome vem numa segunda consulta.
  const { data: profile } = await admin.from('user_profiles').select('full_name').eq('id', t.owner_id).maybeSingle();
  const organizer = profile?.full_name ?? null;

  return (
    <div className="container-app max-w-xl py-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-brand-600 dark:text-brand-400">Inscrição</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.name}</h1>
        {organizer && <p className="text-sm text-gray-500 dark:text-gray-400">Organização: {organizer}</p>}
      </div>
      {t.registration_open ? (
        <RegistrationForm tournamentId={t.id} />
      ) : (
        <div className="card p-6 text-sm text-gray-600 dark:text-gray-300">
          As inscrições deste torneio estão fechadas. Fale com o organizador.
        </div>
      )}
    </div>
  );
}
