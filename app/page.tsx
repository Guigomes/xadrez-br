import { createClient } from '@/lib/supabase/server';
import { MarketingHome } from '@/components/home/marketing-home';
import { OrganizerHome } from '@/components/home/organizer-home';

/**
 * Roteia a home entre duas experiências: organizador logado vê a própria lista
 * de torneios (organizer-home); anônimo e logado-não-organizador veem a landing
 * de marketing (marketing-home). Middleware garante que logado nunca é
 * sequestrado pro último torneio, então essa home sempre aparece pra ele.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles').select('role, is_organizer, full_name').eq('id', user.id).maybeSingle();
    const canCreate = profile?.role === 'admin' || !!profile?.is_organizer;
    if (canCreate) {
      return <OrganizerHome userId={user.id} userName={profile?.full_name ?? null} />;
    }
    // Logado mas ainda não organizador: marketing com CTA pro painel (onde a
    // ativação de organizador acontece).
    return <MarketingHome ctaHref="/admin" />;
  }

  return <MarketingHome ctaHref="/login" />;
}
