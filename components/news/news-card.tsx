import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/date';
import { newsCoverUrl, newsScopeLabel } from '@/lib/utils/news';
import type { News } from '@/types/database';

/** Card da lista pública de notícias — só as colunas que o card renderiza,
 *  não a notícia inteira (quem busca a lista não precisa de body_md/fonte). */
export type NewsCardData = Pick<News,
  'id' | 'slug' | 'cover_path' | 'cover_alt' | 'scope' | 'state' | 'published_at' | 'title' | 'summary'
>;

export function NewsCard({ news }: { news: NewsCardData }) {
  const cover = newsCoverUrl(news.cover_path);

  return (
    <Link
      href={`/noticias/${news.slug}`}
      className="card overflow-hidden flex flex-col transition-colors hover:border-gray-300 dark:hover:border-gray-600"
    >
      {cover ? (
        <div className="relative aspect-[16/9] w-full bg-gray-100 dark:bg-gray-800">
          <Image
            src={cover}
            alt={news.cover_alt ?? ''}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center bg-gray-50 text-3xl dark:bg-gray-800/50">
          ♟
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
            {newsScopeLabel(news.scope, news.state)}
          </Badge>
          {news.published_at && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatDate(news.published_at)}
            </span>
          )}
        </div>
        <h2 className="font-semibold leading-snug text-gray-900 dark:text-gray-100">{news.title}</h2>
        {news.summary && (
          <p className="line-clamp-3 text-sm text-gray-500 dark:text-gray-400">{news.summary}</p>
        )}
      </div>
    </Link>
  );
}
