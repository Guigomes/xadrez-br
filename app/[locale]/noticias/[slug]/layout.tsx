import { createClient } from '@/lib/supabase/server';
import { newsCoverUrl } from '@/lib/utils/news';
import type { Metadata } from 'next';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  // RLS (news_select_public) já esconde rascunho — se voltar vazio, a página
  // vai dar notFound() de qualquer jeito.
  const { data } = await supabase
    .from('news').select('title, summary, cover_path, cover_alt').eq('slug', slug).maybeSingle();
  if (!data) return {};

  const cover = newsCoverUrl(data.cover_path);
  return {
    title: data.title,
    description: data.summary ?? undefined,
    openGraph: {
      title: data.title,
      description: data.summary ?? undefined,
      type: 'article',
      ...(cover ? { images: [{ url: cover, alt: data.cover_alt ?? data.title }] } : {}),
    },
  };
}

export default function NewsDetailLayout({ children }: Props) {
  return children;
}
