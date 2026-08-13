'use client';

import { use, useState } from 'react';
import { useTournament } from '@/lib/hooks/use-tournament';
import { useUser } from '@/lib/hooks/use-auth';
import { useCategories } from '@/lib/hooks/use-classifications';
import {
  useRegistrations,
  useApproveRegistration,
  useRejectRegistration,
  useNextRoundByGroup,
  openReceipt,
  type RegistrationRow,
} from '@/lib/hooks/use-registrations';
import { deriveCategory, type CategoryCandidate } from '@/lib/utils/classification-match';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import type { RegistrationStatus } from '@/types/database';

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: 'Pendentes',
  approved: 'Aprovadas',
  rejected: 'Rejeitadas',
};

const STATUS_BADGE: Record<RegistrationStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
};

interface Props {
  params: Promise<{ slug: string }>;
}

export default function AdminRegistrationsPage({ params }: Props) {
  const { slug } = use(params);
  const { user } = useUser();
  const { data: tournament, isLoading } = useTournament(slug);
  const { data: registrations, isLoading: loadingRegs } = useRegistrations(tournament?.id ?? '');
  const { data: nextRoundByGroup } = useNextRoundByGroup(tournament?.id ?? '');
  const { data: categories } = useCategories(tournament?.id ?? '');
  const approve = useApproveRegistration(tournament?.id ?? '');
  const reject = useRejectRegistration(tournament?.id ?? '');

  const [filter, setFilter] = useState<RegistrationStatus>('pending');
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  const registrationPath = `/tournaments/${slug}/register`;
  const registrationUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${registrationPath}` : registrationPath;

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError('Não foi possível copiar automaticamente — selecione e copie o link manualmente.');
    }
  }

  const all = registrations ?? [];
  const filtered = all.filter((r) => r.status === filter);
  const pendingCount = all.filter((r) => r.status === 'pending').length;

  const candidates: (CategoryCandidate & { name: string })[] = (categories ?? []).map((c) => ({
    id: c.id, name: c.name, sortOrder: c.sort_order, sex: c.sex,
    minAge: c.min_age, maxAge: c.max_age, minRating: c.min_rating, maxRating: c.max_rating,
  }));
  const tournamentStartYear = tournament.start_date ? new Date(tournament.start_date).getFullYear() : null;

  // Compara o que o inscrito declarou com o que a regra derivaria — mesma
  // regra de derive_player_category (035), espelhada em classification-match.ts.
  // Só sinaliza divergência quando dá pra derivar algo com o dado disponível;
  // sem birth_year/sex a derivação fica null e não é tratada como divergência
  // (é "sem dado", não "declarou errado").
  function declaredVsDerived(r: RegistrationRow): { declared: string | null; derived: string | null; diverges: boolean } {
    const derived = deriveCategory(candidates, { sex: r.sex, birthYear: r.birth_year, ratingStd: r.rating_std }, tournamentStartYear);
    const declared = r.category?.name ?? null;
    const derivedId = derived?.id ?? null;
    const declaredId = r.category?.id ?? null;
    return { declared, derived: derived?.name ?? null, diverges: derivedId !== null && derivedId !== declaredId };
  }

  async function handleApprove(registration: RegistrationRow) {
    if (!user) return;
    setActingId(registration.id);
    setError('');
    try {
      await approve.mutateAsync({ registration, userId: user.id });
    } catch (err: any) {
      setError(err.message ?? 'Erro ao aprovar inscrição.');
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(registration: RegistrationRow) {
    const reason = window.prompt('Motivo da rejeição (opcional):') ?? '';
    setActingId(registration.id);
    setError('');
    try {
      await reject.mutateAsync({ registrationId: registration.id, reason });
    } catch (err: any) {
      setError(err.message ?? 'Erro ao rejeitar inscrição.');
    } finally {
      setActingId(null);
    }
  }

  async function handleOpenReceipt(path: string) {
    setError('');
    try {
      await openReceipt(path);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Inscrições {pendingCount > 0 && `· ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`}
      </p>

      {/* Link de inscrição — o organizador compartilha com os jogadores.
          data-tour fica sempre no wrapper (mesmo com inscrições fechadas)
          pra não quebrar o alvo do tour guiado quando o organizador ainda
          não publicou/abriu inscrições nesse ponto do fluxo. */}
      <div className="card p-4 mb-4" data-tour="link-inscricao">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Link de inscrição</h2>
        {tournament.status === 'registration' ? (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Compartilhe este link com os jogadores para eles se inscreverem sozinhos ou cadastre eles manualmente na aba participantes.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={registrationUrl}
                onClick={(e) => e.currentTarget.select()}
                className="flex-1"
              />
              <Button variant="secondary" onClick={handleCopyLink}>
                {linkCopied ? '✓ Copiado' : 'Copiar'}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            O link de inscrição aparece aqui assim que o torneio entrar em <strong>Inscrições abertas</strong>.
            {tournament.status === 'draft' && ' Você está em Rascunho: publique o torneio e depois abra as inscrições nos botões no topo da página.'}
            {tournament.status === 'published' && ' O torneio já está publicado: é só abrir as inscrições no botão no topo da página.'}
            {(tournament.status === 'registration_closed' || tournament.status === 'ongoing' || tournament.status === 'finished') && ' As inscrições deste torneio já foram encerradas.'}
          </p>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {tournament.status === 'ongoing' && (
        <p className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          ⏱ Torneio em andamento — inscrições aprovadas agora entram como <strong>entrada tardia</strong>:
          o jogador recebe bye (0 pontos) nas rodadas já disputadas do grupo.
        </p>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(Object.keys(STATUS_LABELS) as RegistrationStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-brand-600 text-white'
                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {STATUS_LABELS[s]} ({all.filter((r) => r.status === s).length})
          </button>
        ))}
      </div>

      {loadingRegs ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📝"
          title={`Nenhuma inscrição ${STATUS_LABELS[filter].toLowerCase().replace('s', '')}`}
          description={
            filter === 'pending'
              ? 'Compartilhe o link público de inscrição para receber participantes.'
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const { declared, derived, diverges } = declaredVsDerived(r);
            return (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{r.full_name}</p>
                    <Badge className={STATUS_BADGE[r.status]}>
                      {STATUS_LABELS[r.status].replace(/s$/, '')}
                    </Badge>
                    {r.pairing_groups?.name && (
                      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        {r.pairing_groups.name}
                      </Badge>
                    )}
                    {declared && (
                      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        🏷️ {declared}
                      </Badge>
                    )}
                    {diverges && (
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                        ⚠️ diverge: seria {derived}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-x-3">
                    {r.birth_year && <span>🎂 {r.birth_year}</span>}
                    {r.sex && <span>{r.sex === 'w' ? '♀ Feminino' : '♂ Masculino'}</span>}
                    {(r.city || r.state) && <span>📍 {[r.city, r.state].filter(Boolean).join('/')}</span>}
                    {r.club_or_school && <span>🏫 {r.club_or_school}</span>}
                    {r.rating_std != null && <span>♟ Rating {r.rating_std}</span>}
                    {r.federation && <span>🌐 {r.federation}</span>}
                    {r.cbx_id && <span>CBX {r.cbx_id}</span>}
                    {r.fide_id && <span>FIDE {r.fide_id}</span>}
                  </p>
                  {(r.email || r.phone) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 space-x-3">
                      {r.email && <span>✉️ {r.email}</span>}
                      {r.phone && <span>📱 {r.phone}</span>}
                    </p>
                  )}
                  {r.status === 'rejected' && r.rejected_reason && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                      Motivo: {r.rejected_reason}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Enviada em {new Date(r.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.payment_receipt_path && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenReceipt(r.payment_receipt_path!)}
                    >
                      📎 Comprovante
                    </Button>
                  )}
                  {r.status === 'pending' && (
                    <>
                      {tournament.status === 'ongoing' && r.pairing_group_id && (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400">
                          entra na rodada {nextRoundByGroup?.get(r.pairing_group_id) ?? '?'}
                        </span>
                      )}
                      <Button
                        size="sm"
                        loading={actingId === r.id && approve.isPending}
                        onClick={() => handleApprove(r)}
                      >
                        Aprovar
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={actingId === r.id && reject.isPending}
                        onClick={() => handleReject(r)}
                      >
                        Rejeitar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
