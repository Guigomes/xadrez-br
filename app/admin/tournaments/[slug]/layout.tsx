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
    .select('name, mode, status, registration_end_date')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  return (
    <div>
      <AdminTournamentChrome
        slug={slug} name={tournament.name} mode={tournament.mode} status={tournament.status}
        registrationEndDate={tournament.registration_end_date}
      />
      {children}
    </div>
  );
}
