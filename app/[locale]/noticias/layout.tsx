import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notícias',
  description: 'Notícias do xadrez no seu estado, no Brasil e no mundo.',
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
