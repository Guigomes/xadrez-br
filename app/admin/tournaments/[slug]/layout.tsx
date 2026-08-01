import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminTournamentChrome } from '@/components/admin/admin-tournament-chrome';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function AdminTournamentLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, mode, status, registration_end_date, pairing_mode')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

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

  return (
    <div>
      <AdminTournamentChrome
        id={tournament.id} slug={slug} name={tournament.name} mode={tournament.mode} status={tournament.status}
        registrationEndDate={tournament.registration_end_date} pairingReady={pairingReady}
      />
      {children}
    </div>
  );
}
