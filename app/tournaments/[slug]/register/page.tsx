import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { RegistrationForm } from '@/components/tournament/registration-form';
import { formatDateRange } from '@/lib/utils/date';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('tournaments').select('name').eq('slug', slug).single();
  if (!data) return {};
  return {
    title: `Inscrição — ${data.name}`,
    description: `Inscreva-se no torneio ${data.name}`,
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function RegisterPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  const { data: groups } = await supabase
    .from('pairing_groups')
    .select('id, name')
    .eq('tournament_id', tournament.id)
    .order('sort_order');

  const { data: { user } } = await supabase.auth.getUser();
  let autofill = null;
  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_participant, full_name, email, birth_year, city, state, club_or_school, federation, fide_id, cbx_id, phone')
      .eq('id', user.id)
      .single();
    if (profile?.is_participant) autofill = profile;
  }

  const today = todayISO();
  const beforeWindow =
    tournament.registration_start_date && today < tournament.registration_start_date;
  const afterWindow =
    tournament.registration_end_date && today > tournament.registration_end_date;
  const isOpen =
    tournament.status === 'registration' && !beforeWindow && !afterWindow;

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inscrição</h1>
        {tournament.registration_start_date && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Período: {formatDateRange(tournament.registration_start_date, tournament.registration_end_date)}
          </p>
        )}
      </div>

      {isOpen ? (
        <RegistrationForm
          tournamentId={tournament.id}
          tournamentSlug={slug}
          groups={groups ?? []}
          requirePaymentReceipt={tournament.require_payment_receipt}
          registrationFeeText={tournament.registration_fee_text}
          isFree={tournament.is_free}
          autofill={autofill}
          saveAutofillOnSubmit={!!autofill}
        />
      ) : (
        <div className="card p-6 text-center space-y-3">
          <span className="text-4xl">🗓️</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {beforeWindow
              ? 'Inscrições ainda não abriram'
              : tournament.status === 'draft' || tournament.status === 'registration'
                ? 'Inscrições não estão abertas'
                : 'Inscrições encerradas'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {beforeWindow && tournament.registration_start_date
              ? `As inscrições abrem em ${new Date(tournament.registration_start_date + 'T12:00:00').toLocaleDateString('pt-BR')}.`
              : tournament.status === 'ongoing'
                ? 'O torneio já está em andamento.'
                : tournament.status === 'finished'
                  ? 'O torneio já foi encerrado.'
                  : 'Acompanhe esta página — a organização abrirá as inscrições em breve.'}
          </p>
          <Link
            href={`/tournaments/${slug}`}
            className="inline-block text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            ← Voltar ao torneio
          </Link>
        </div>
      )}
    </div>
  );
}
