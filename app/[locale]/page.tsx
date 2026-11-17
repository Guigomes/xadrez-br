import { getSessionUser, getSessionProfile } from '@/lib/data/session';
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
 * função pra quem já usa o produto). Toda conta logada pode criar torneio
 * (migration 20261116120000): logado vai direto criar, anônimo vai logar.
 *
 * Middleware garante que logado nunca é sequestrado pro último torneio, então
 * essa home sempre aparece pra ele.
 */
export default async function HomePage() {
  // getSessionUser já foi chamado pelo layout raiz neste mesmo request
  // (lib/data/session.ts) — aqui volta do cache, sem ida à rede.
  const user = await getSessionUser();

  if (user) {
    const profile = await getSessionProfile();
    return (
      <MarketingHome
        ctaHref="/admin/torneios/novo"
        dashboard={<OrganizerDashboard userId={user.id} userName={profile?.full_name ?? null} />}
      />
    );
  }

  return <MarketingHome ctaHref="/entrar" />;
}
