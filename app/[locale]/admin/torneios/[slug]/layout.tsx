import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminTournamentChrome } from '@/components/admin/admin-tournament-chrome';
import { getSessionUser, redirectToTournamentPage } from '@/lib/data/session';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function AdminTournamentLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  // Painel do torneio é só de quem gerencia (dono, equipe, admin — is_tournament_manager).
  // Os demais, inclusive logados, voltam para a página pública do torneio. A decisão é
  // tomada aqui, no servidor, antes de qualquer tela do painel renderizar. Quem não está
  // logado já foi mandado pra lá pelo middleware; o teste aqui cobre o resto.
  const user = await getSessionUser();
  if (!user) return redirectToTournamentPage(slug);

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, mode, status, registration_end_date, registration_closes_by_date, pairing_mode')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  const { data: isManager } = await supabase.rpc('is_tournament_manager', { p_tournament_id: tournament.id });
  if (!isManager) return redirectToTournamentPage(slug);

  // "Publicar" (draft -> published) fica bloqueado com emparceiramento
  // 'custom' incompleto — sem grupo criado ou com classificação sem grupo
  // mapeado, approve_registration (enforce_native_pairing_group) rejeitaria
  // o primeiro jogador aprovado. Só consulta quando de fato importa (draft +
  // custom) pra não pagar 2 queries extras em toda navegação do admin.
  let pairingReady = true;
  if (tournament.status === 'draft' && tournament.pairing_mode === 'custom') {
    const [{ count: groupCount }, { count: unmappedCount }] = await Promise.all([
      supabase.from('pairing_groups').select('id', { count: 'exact', head: true }).eq('tournament_id', tournament.id),
      supabase.from('tournament_categories').select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id).is('pairing_group_id', null),
    ]);
    pairingReady = (groupCount ?? 0) > 0 && (unmappedCount ?? 0) === 0;
  }

  // Importado: hora da última sincronização (e quantos grupos estão com erro),
  // mostrada junto do botão "Sincronizar dados importados". Conta só as
  // importações ligadas; sem nenhuma ligada, todas.
  let lastSync: { at: string | null; total: number; errors: number } | null = null;
  if (tournament.mode === 'imported') {
    const { data: imports } = await supabase
      .from('tournament_imports')
      .select('enabled, last_run_at, last_status')
      .eq('tournament_id', tournament.id);
    if (imports?.length) {
      const enabled = imports.filter((row) => row.enabled);
      const rows = enabled.length ? enabled : imports;
      const at = rows.map((row) => row.last_run_at).filter((v): v is string => !!v).sort().pop() ?? null;
      lastSync = { at, total: rows.length, errors: rows.filter((row) => row.last_status === 'error').length };
    }
  }

  return (
    <div>
      <AdminTournamentChrome
        id={tournament.id} slug={slug} name={tournament.name} mode={tournament.mode} status={tournament.status}
        registrationEndDate={tournament.registration_end_date}
        pairingReady={pairingReady}
        lastSync={lastSync}
      />
      {children}
    </div>
  );
}
