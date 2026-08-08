import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Analytics } from '@vercel/analytics/next';
import { PwaRegister } from '@/components/pwa-register';
import { ChatWidget } from '@/components/chat/chat-widget';
import { ErrorLogger } from '@/components/error-logger';
import { createClient } from '@/lib/supabase/server';

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: {
    default: 'Torneios Xadrez BR',
    template: '%s | Torneios Xadrez BR',
  },
  description: 'Crie e gerencie torneios de xadrez: inscrição online, emparceiramento automático, classificação por categoria e página pública ao vivo.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Torneios BR',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'Torneios Xadrez BR',
    title: 'Torneios Xadrez BR',
    description: 'Crie e gerencie torneios de xadrez, do formulário de inscrição ao emparceiramento.',
  },
};

export const viewport: Viewport = {
  themeColor: '#2d6e4e',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lê a sessão no servidor pra o primeiro paint do header/chat já sair com o
  // estado logado — sem isso, useUser() só resolve depois da hidratação e a
  // barra pisca "Entrar" antes de virar "Minha conta".
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const initialUser = user ? { id: user.id, email: user.email ?? null } : null;

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans min-h-screen flex flex-col`}>
        <Providers>
          <Header initialUser={initialUser} />
          <main className="flex-1">{children}</main>
          <Footer />
          <ChatWidget initialUser={initialUser} />
        </Providers>
        <PwaRegister />
        <ErrorLogger />
        <Analytics />
      </body>
    </html>
  );
}
