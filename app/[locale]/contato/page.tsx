import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { LegalPage, CONTACT_WHATSAPP_LABEL, contactWhatsappHref } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Fale com o Gambito Torneios: dúvidas, sugestões, divulgação de torneios e pedidos sobre dados pessoais.',
  alternates: { canonical: '/contato' },
};

export default function ContactPage() {
  return (
    <LegalPage title="Contato">
      <p>
        O Gambito Torneios é mantido por uma pessoa e uma comunidade de organizadores e jogadores de xadrez.
        Fale conosco para:
      </p>
      <ul>
        <li>enviar o link de um torneio para ser acompanhado no site;</li>
        <li>tirar dúvidas ou enviar sugestões;</li>
        <li>pedir correção ou remoção de dados (inclusive de menores de idade);</li>
        <li>falar sobre parcerias e divulgação de eventos.</li>
      </ul>

      <h2>WhatsApp</h2>
      <p>
        <a
          href={contactWhatsappHref('Olá! Vim pelo Gambito Torneios e gostaria de falar sobre uma dúvida ou sugestão.')}
          target="_blank"
          rel="noopener noreferrer"
        >
          {CONTACT_WHATSAPP_LABEL}
        </a>
        . Respondemos em dias úteis.
      </p>

      <h2>Chat do site</h2>
      <p>
        O assistente do Gambito (botão no canto da tela) responde dúvidas sobre o uso do site e encaminha o que
        precisar de atendimento humano.
      </p>

      <h2>Dados pessoais</h2>
      <p>
        Para pedidos sobre seus dados, veja a <Link href="/privacidade">Política de Privacidade</Link>.
      </p>
    </LegalPage>
  );
}
