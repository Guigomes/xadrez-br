import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { Markdown } from '@/components/news/markdown';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/date';
import { newsCoverUrl, newsScopeLabel } from '@/lib/utils/news';
import type { NewsScope } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  // Sem filtro de status aqui: a policy news_select_public (migration 059) já
  // limita a leitura anônima ao que está publicado — rascunho simplesmente
  // não volta, e cai no notFound().
  const { data: news } = await supabase.from('news').select('*').eq('slug', slug).maybeSingle();
  if (!news) notFound();

  const cover = newsCoverUrl(news.cover_path);

  return (
    <div className="container-app py-8">
      <Link href="/noticias" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
        ← Todas as notícias
      </Link>

      <article className="mx-auto mt-4 max-w-2xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
            {newsScopeLabel(news.scope as NewsScope, news.state)}
          </Badge>
          {news.published_at && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatDate(news.published_at)}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold leading-tight text-gray-900 dark:text-gray-100">
          {news.title}
        </h1>
        {news.summary && (
          <p className="mt-2 text-gray-500 dark:text-gray-400">{news.summary}</p>
        )}

        {cover && (
          <div className="relative mt-5 aspect-[16/9] w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
            <Image
              src={cover}
              alt={news.cover_alt ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 42rem"
              className="object-cover"
              priority
            />
          </div>
        )}

        <div className="mt-6">
          <Markdown>{news.body_md}</Markdown>
        </div>

        {(news.source_name || news.source_url) && (
          <div className="mt-8 border-t border-gray-200 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">Fonte: </span>
            {news.source_url ? (
              <a
                href={news.source_url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="text-brand-600 hover:underline dark:text-brand-400 break-all"
              >
                {news.source_name ?? news.source_url}
              </a>
            ) : (
              news.source_name
            )}
          </div>
        )}
      </article>
    </div>
  );
}
