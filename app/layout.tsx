import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Analytics } from '@vercel/analytics/next';
import { PwaRegister } from '@/components/pwa-register';

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: {
    default: 'XadrezBR – Torneios de Xadrez',
    template: '%s | XadrezBR',
  },
  description: 'Acompanhe torneios de xadrez, resultados, classificações e o desempenho dos jogadores em tempo real.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'XadrezBR',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'XadrezBR',
    title: 'XadrezBR – Torneios de Xadrez',
    description: 'Acompanhe torneios de xadrez, resultados e classificações.',
  },
};

export const viewport: Viewport = {
  themeColor: '#2d6e4e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans min-h-screen flex flex-col`}>
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}
