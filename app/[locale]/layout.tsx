import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import '../globals.css';
import { Providers } from './providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Analytics } from '@vercel/analytics/next';
import { AccessTracker } from '@/components/access-tracker';
import { PwaRegister } from '@/components/pwa-register';
import { ErrorLogger } from '@/components/error-logger';
import dynamic from 'next/dynamic';
import { getSessionUser } from '@/lib/data/session';
import { routing } from '@/i18n/routing';

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' });

// O widget do Gambito (~430 linhas + hooks de chat) mora no layout raiz, ou
// seja, entrava no bundle inicial de TODA rota do site pra ficar quase sempre
// fechado. Em chunk próprio, ele carrega em paralelo sem atrasar o conteúdo da
// página. Sem `ssr: false` porque isto é um Server Component — o que interessa
// aqui é o code splitting, não pular o SSR.
const ChatWidget = dynamic(() =>
  import('@/components/chat/chat-widget').then((m) => m.ChatWidget)
);

// Um param por locale — habilita geração estática das rotas de cada idioma
// em vez de tudo cair em SSR dinâmico. Ver docs/plano-i18n.md §2.2.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: '#2d6e4e',
  width: 'device-width',
  initialScale: 1,
};

// title/openGraph.title reaproveitam brand.name (idêntico nos 3 idiomas —
// decisão do dono do produto, docs/pendencias-i18n.md §3.1: nome próprio não
// traduz). description segue pt-BR por ora — é conteúdo de superfície
// pública, entra na Fase 3 (tradução), fora do escopo desta rodada
// (mecanismo: Fases 0-2). alternates.languages é estrutural (hreflang),
// aponta pra home de cada idioma — por página viria depois, se precisar.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brand' });
  const name = t('name');
  return {
    title: { default: name, template: `%s | ${name}` },
    description: 'Crie e gerencie torneios de xadrez: inscrição online, emparceiramento automático, classificação por categoria e página pública ao vivo.',
    icons: {
      icon: '/favicon.ico',
      apple: '/icons/icon-192x192.png',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Gambito',
    },
    formatDetection: { telephone: false },
    other: {
      'google-adsense-account': 'ca-pub-3737758644488199',
    },
    openGraph: {
      type: 'website',
      siteName: name,
      title: name,
      description: 'Crie e gerencie torneios de xadrez, do formulário de inscrição ao emparceiramento.',
    },
    alternates: {
      languages: {
        'pt-BR': '/',
        es: '/es',
        en: '/en',
        'x-default': '/',
      },
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Habilita renderização estática pras páginas desta árvore que não
  // dependem de request dinâmico (next-intl precisa saber o locale "cedo"
  // pra isso funcionar em Server Components abaixo). Ver docs next-intl.
  setRequestLocale(locale);

  // Lê a sessão no servidor pra o primeiro paint do header/chat já sair com o
  // estado logado — sem isso, useUser() só resolve depois da hidratação e a
  // barra pisca "Entrar" antes de virar "Minha conta".
  // getSessionUser é memoizado por request (lib/data/session.ts), então as
  // camadas abaixo (layout do admin, páginas) reusam esta mesma chamada.
  const [initialUser, messages] = await Promise.all([
    getSessionUser(),
    getMessages(),
  ]);

  return (
    <html lang={locale} suppressHydrationWarning>
      {/* Metadata assíncrono pode ser transmitido no <body> pelo Next.js.
          O manifesto precisa estar no <head> para o Chrome reconhecer a PWA. */}
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen flex flex-col`}>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <Header initialUser={initialUser} />
            <main className="flex-1">{children}</main>
            <Footer />
            <ChatWidget initialUser={initialUser} />
          </Providers>
        </NextIntlClientProvider>
        <PwaRegister />
        <ErrorLogger />
        <Analytics />
        <AccessTracker />
        {/* Verificação de propriedade do site no Google AdSense — precisa
            aparecer em toda página, não só na de torneio. */}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3737758644488199"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
