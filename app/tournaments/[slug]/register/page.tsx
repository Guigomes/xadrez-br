import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { getSessionUser } from '@/lib/data/session';
import { RegistrationForm } from '@/components/tournament/registration-form';
import { formatDateRange } from '@/lib/utils/date';
import { todayInSaoPaulo } from '@/lib/utils/chess';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTournamentPageData(slug);
  if (!data) return {};
  return {
    title: `Inscrição — ${data.tournament.name}`,
    description: `Inscreva-se no torneio ${data.tournament.name}`,
  };
}

// Horário de Brasília, não UTC. A Vercel roda em UTC, então o
// toISOString() que estava aqui já valia "amanhã" entre 21:00 e 00:00 BRT —
// a tela dizia que a inscrição tinha encerrado 3h antes da hora. Mesmo
// motivo do today_brt() no banco (migration 043): as três checagens de
// janela (esta, a RLS e o selo de status) precisam concordar sobre "hoje".
const todayISO = todayInSaoPaulo;

export default async function RegisterPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  // Mesma chamada que o layout do torneio já fez (get_tournament_page_data,
  // migration 071) — memoizada por request, não repete o round-trip. Ela
  // embute o get_tournament_by_slug (migration 040), que corrige inscrição
  // encerrada / torneio iniciado por data antes de decidir se o form abre.
  // O usuário vem memoizado do layout raiz.
  const [pageData, user] = await Promise.all([
    getTournamentPageData(slug),
    getSessionUser(),
  ]);

  if (!pageData) notFound();
  const { tournament } = pageData;

  // Categorias e perfil de autofill são independentes entre si.
  const [{ data: categoryRows }, { data: profile }] = await Promise.all([
    supabase
      .from('tournament_categories')
      .select('id, name, sort_order, sex, min_age, max_age, min_rating, max_rating')
      .eq('tournament_id', tournament.id)
      .order('name'),
    user
      ? supabase
          .from('user_profiles')
          .select('is_participant, full_name, email, birth_year, city, state, club_or_school, federation, fide_id, cbx_id, phone')
          .eq('id', user.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  // Mapeia pro shape camelCase que classification-match.ts espera (mesma
  // regra de derivação do SQL, usada aqui só pra pré-selecionar a
  // classificação — a escolha final continua sendo do inscrito).
  const classifications = (categoryRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
    sex: c.sex as 'm' | 'w' | null,
    minAge: c.min_age,
    maxAge: c.max_age,
    minRating: c.min_rating,
    maxRating: c.max_rating,
  }));
  const tournamentStartYear = tournament.start_date
    ? new Date(tournament.start_date).getFullYear()
    : null;

  // Autofill só pra quem marcou "sou participante" no perfil (migrations 027/028).
  const autofill = (profile as { is_participant?: boolean } | null)?.is_participant ? profile : null;

  const today = todayISO();
  const beforeWindow =
    tournament.registration_start_date && today < tournament.registration_start_date;
  const afterWindow =
    tournament.registration_end_date && today > tournament.registration_end_date;
  const isOpen =
    tournament.status === 'registration' && !beforeWindow && !afterWindow;
  // status ainda pode estar 'registration' com o prazo já vencido, se o
  // organizador não clicou "Avançar" pra registration_closed — cobre os
  // dois casos com a mesma variável em vez de duplicar a checagem de data.
  const isNotYetOpen = tournament.status === 'draft' || tournament.status === 'published';
  const isClosed =
    tournament.status === 'registration_closed' ||
    (tournament.status === 'registration' && afterWindow);

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
          classifications={classifications}
          tournamentStartYear={tournamentStartYear}
          requirePaymentReceipt={tournament.require_payment_receipt}
          registrationFeeText={tournament.registration_fee_text}
          isFree={tournament.is_free}
          requireCbxId={tournament.require_cbx_id}
          hasAbsoluteClassification={tournament.has_absolute_classification ?? true}
          autofill={autofill}
          saveAutofillOnSubmit={!!autofill}
        />
      ) : (
        <div className="card p-6 text-center space-y-3">
          <span className="text-4xl">🗓️</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {beforeWindow
              ? 'Inscrições ainda não abriram'
              : isNotYetOpen
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
                  : isClosed
                    ? 'O período de inscrições para este torneio já foi encerrado.'
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
