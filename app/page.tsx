import { createClient } from '@/lib/supabase/server';
import { MarketingHome } from '@/components/home/marketing-home';
import { OrganizerDashboard } from '@/components/home/organizer-dashboard';

/**
 * Home única pra todo mundo. Antes ela ROTEAVA entre duas telas: organizador
 * logado via a própria lista de torneios (e mais nada), anônimo e logado-não-
 * organizador viam a landing. Pedido do usuário: o organizador quer a página
 * inicial COM o dashboard embutido, não em vez dela — trocar a página inteira
 * fazia ele perder torneios ao vivo, notícias e recursos.
 *
 * Agora todos recebem `MarketingHome`; o organizador recebe também o slot
 * `dashboard`, que entra no lugar do hero (o hero é o discurso de venda, sem
 * função pra quem já usa o produto). O CTA muda de destino conforme o que a
 * pessoa pode fazer: criar direto, ativar organizador no painel, ou logar.
 *
 * Middleware garante que logado nunca é sequestrado pro último torneio, então
 * essa home sempre aparece pra ele.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles').select('role, is_organizer, full_name').eq('id', user.id).maybeSingle();
    const canCreate = profile?.role === 'admin' || !!profile?.is_organizer;
    if (canCreate) {
      return (
        <MarketingHome
          ctaHref="/admin/tournaments/new"
          dashboard={<OrganizerDashboard userId={user.id} userName={profile?.full_name ?? null} />}
        />
      );
    }
    // Logado mas ainda não organizador: marketing com CTA pro painel (onde a
    // ativação de organizador acontece). Sem dashboard — não há torneio dele
    // pra mostrar.
    return <MarketingHome ctaHref="/admin" />;
  }

  return <MarketingHome ctaHref="/login" />;
}
