import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Regras de uso do Gambito Torneios: contas, inscrições, conteúdo de torneios e responsabilidades.',
  alternates: { canonical: '/termos' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updated="19 de outubro de 2026">
      <p>
        Ao usar o Gambito Torneios (gambitotorneios.com.br) você concorda com estes termos. Se não concordar,
        não use o serviço.
      </p>

      <h2>1. O que é o serviço</h2>
      <p>
        Plataforma para acompanhar e organizar torneios de xadrez: agenda, inscrições, rodadas, classificação,
        histórico de jogadores e notícias. Parte dos dados de torneios é importada de fontes públicas de
        resultados (como chess-results.com e info64.org) e pode ter atraso ou diferenças em relação à fonte.
      </p>

      <h2>2. Conta e responsabilidade</h2>
      <ul>
        <li>Você é responsável pelas informações que fornece e pela segurança da sua conta.</li>
        <li>Menores de idade devem usar o serviço com acompanhamento dos pais ou responsáveis.</li>
        <li>Organizadores respondem pelo conteúdo, regulamento, taxas e resultados dos seus torneios.</li>
      </ul>

      <h2>3. Resultados e informações</h2>
      <p>
        Fazemos o possível para exibir dados corretos, mas não garantimos que estejam livres de erros ou
        atualizados em tempo real. Para fins oficiais (títulos, rating, homologação), vale o resultado divulgado
        pela organização do torneio e pelas entidades competentes (federações, CBX, FIDE).
      </p>

      <h2>4. Inscrições e pagamentos</h2>
      <p>
        A inscrição em um torneio é um acordo entre o participante e a organização do evento, que define taxa,
        prazos e regras de reembolso. Os pagamentos online são processados por um provedor terceirizado.
      </p>

      <h2>5. Uso aceitável</h2>
      <ul>
        <li>Não tente acessar áreas restritas, sobrecarregar ou interferir no funcionamento do serviço.</li>
        <li>Não use o serviço para fraude, assédio ou para publicar conteúdo ilegal ou ofensivo.</li>
        <li>Não copie em massa o conteúdo do site por meios automatizados sem autorização.</li>
      </ul>

      <h2>6. Conteúdo e propriedade</h2>
      <p>
        A marca, o layout e o código do Gambito Torneios pertencem aos seus responsáveis. Nomes, partidas e
        resultados de jogadores pertencem aos respectivos titulares e fontes. Ao publicar conteúdo no serviço,
        você declara ter o direito de fazê-lo.
      </p>

      <h2>7. Publicidade</h2>
      <p>
        O serviço pode exibir anúncios de terceiros, como o Google AdSense. Não controlamos o conteúdo dos
        anúncios. Veja a <Link href="/privacidade">Política de Privacidade</Link> para saber como cookies de
        publicidade são usados.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        O serviço é oferecido como está. Na extensão permitida pela lei, não nos responsabilizamos por perdas
        decorrentes de indisponibilidade, erros de dados importados ou decisões tomadas com base neles.
      </p>

      <h2>9. Alterações e encerramento</h2>
      <p>
        Podemos alterar o serviço e estes termos, e suspender contas que violem as regras. A data no topo indica
        a última revisão.
      </p>

      <h2>10. Contato e foro</h2>
      <p>
        Dúvidas? Veja a página de <Link href="/contato">Contato</Link>. Estes termos seguem a lei brasileira.
      </p>
    </LegalPage>
  );
}
