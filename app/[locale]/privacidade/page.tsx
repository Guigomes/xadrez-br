import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { LegalPage, CONTACT_WHATSAPP_LABEL, contactWhatsappHref } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como o Gambito Torneios coleta, usa e protege dados de visitantes, jogadores e organizadores, incluindo cookies e anúncios do Google.',
  alternates: { canonical: '/privacidade' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updated="21 de outubro de 2026">
      <p>
        O Gambito Torneios (gambitotorneios.com.br) divulga e organiza torneios de xadrez: inscrições, rodadas,
        classificação e histórico de jogadores. Esta política explica quais dados tratamos, para quê, e quais são
        os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <h2>1. Quais dados tratamos</h2>
      <ul>
        <li>
          <b>Dados públicos de torneios.</b> Nome, federação/estado, rating, resultados e partidas de jogadores,
          publicados por organizadores e por fontes públicas de resultados (como chess-results.com e info64.org),
          que importamos para exibir rodadas e classificações.
        </li>
        <li>
          <b>Conta.</b> Se você entra com a conta Google, recebemos nome, e-mail e foto de perfil. Organizadores
          e jogadores inscritos podem informar ainda ano de nascimento, cidade, ID CBX/FIDE e telefone para a
          inscrição.
        </li>
        <li>
          <b>Inscrições e pagamentos.</b> Dados da inscrição e o status do pagamento. Os dados de cartão ou Pix
          são tratados pelo processador de pagamentos (Asaas); não armazenamos números de cartão.
        </li>
        <li>
          <b>App Gambito Torneios.</b> O torneio criado no app fica no celular do organizador. Se ele entrar com a
          conta Google, uma cópia de cada torneio (nomes dos jogadores, escola, ano de nascimento, sexo, rating
          e resultados) é guardada na conta dele como backup, visível só para ele. O torneio só aparece no site
          se o organizador escolher torná-lo público, e pode voltar a privado ou ser apagado a qualquer momento.
          Na inscrição pelo link do app, os dados enviados (nome, ano de nascimento, sexo, escola ou clube, rating,
          responsável e contato) ficam guardados para o organizador daquele torneio aceitar ou recusar; o contato
          não aparece no site.
        </li>
        <li>
          <b>Notificações.</b> Se você ativar os avisos de rodada, guardamos o identificador do seu navegador
          para enviá-los. Você pode desativar nas configurações do navegador a qualquer momento.
        </li>
        <li>
          <b>Chat de suporte.</b> As mensagens que você envia ao assistente do site, usadas para responder e
          melhorar o atendimento.
        </li>
        <li>
          <b>Uso do site.</b> Páginas acessadas, tipo de dispositivo e navegador, para estatísticas e para
          manter o serviço funcionando e seguro.
        </li>
      </ul>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Exibir torneios, rodadas, classificações e perfis de jogadores.</li>
        <li>Processar inscrições, check-in, pagamentos e comunicação com organizadores e jogadores.</li>
        <li>Enviar avisos que você pediu (por exemplo, nova rodada).</li>
        <li>Prevenir fraudes e abusos, e corrigir erros do serviço.</li>
        <li>Exibir anúncios (veja o item 4).</li>
      </ul>

      <h2>3. Menores de idade</h2>
      <p>
        Muitos jogadores são crianças e adolescentes. Nesses casos, a inscrição e o uso da conta devem ser feitos
        pelos pais ou responsáveis. Mostramos publicamente apenas o necessário sobre o atleta (nome, categoria,
        resultados) e não exibimos documentos, telefone ou e-mail. Pais e responsáveis podem pedir a correção ou
        a remoção dos dados do menor (item 7).
      </p>

      <h2>4. Cookies e anúncios do Google</h2>
      <p>
        Usamos cookies e tecnologias semelhantes para manter você conectado, lembrar preferências (como tema
        claro/escuro e idioma) e medir o uso do site.
      </p>
      <p>
        O site pode exibir anúncios do Google AdSense. O Google e seus parceiros usam cookies para exibir anúncios
        com base nas suas visitas a este e a outros sites. Com o cookie de publicidade, o Google e seus parceiros
        podem exibir anúncios personalizados. Você pode desativar a publicidade personalizada em{' '}
        <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Configurações de anúncios do Google</a>{' '}
        e saber mais em{' '}
        <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">como o Google usa dados de sites parceiros</a>.
        Você também pode bloquear ou apagar cookies nas configurações do seu navegador; algumas funções (como
        manter o login) podem deixar de funcionar.
      </p>

      <h2>5. Com quem compartilhamos</h2>
      <p>Não vendemos dados pessoais. Usamos prestadores que tratam dados em nosso nome:</p>
      <ul>
        <li>Supabase (banco de dados e autenticação) e Vercel (hospedagem do site);</li>
        <li>Google (login com a conta Google e AdSense);</li>
        <li>Asaas (pagamentos);</li>
        <li>provedores de inteligência artificial usados pelo chat de suporte (Anthropic e Voyage AI), que recebem apenas o texto da pergunta.</li>
      </ul>
      <p>
        Organizadores de torneios acessam os dados das inscrições dos próprios torneios. Dados também podem ser
        compartilhados por obrigação legal ou ordem judicial.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <p>
        Resultados e histórico de torneios ficam disponíveis enquanto o serviço existir, pois são o registro
        esportivo dos atletas. Dados de conta e inscrição são mantidos enquanto a conta existir e pelo prazo
        necessário para obrigações legais. Você pode pedir a exclusão (item 7).
      </p>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode pedir confirmação de que tratamos seus dados, acesso, correção, anonimização, portabilidade,
        eliminação de dados tratados com consentimento e informação sobre compartilhamento. Para exercer esses
        direitos, ou para pedir a remoção dos dados de um menor, fale conosco pela página de{' '}
        <Link href="/contato">Contato</Link> ou pelo WhatsApp{' '}
        <a href={contactWhatsappHref('Olá! Quero exercer um direito sobre meus dados (LGPD).')} target="_blank" rel="noopener noreferrer">{CONTACT_WHATSAPP_LABEL}</a>.
        Dados de resultados que vêm de fontes públicas de torneios podem exigir que o pedido também seja feito à fonte.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Adotamos medidas técnicas razoáveis (conexão criptografada, controle de acesso por perfil, banco de dados
        com regras de permissão por linha) para proteger os dados. Nenhum sistema é totalmente imune a falhas; em
        caso de incidente relevante, avisaremos os afetados e as autoridades conforme a lei.
      </p>

      <h2>9. Mudanças nesta política</h2>
      <p>
        Podemos atualizar esta política. A data no topo mostra a última revisão.
      </p>
    </LegalPage>
  );
}
