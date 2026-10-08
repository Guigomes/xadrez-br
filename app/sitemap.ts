import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { siteUrl } from '@/lib/seo';
import { routing } from '@/i18n/routing';

// Regenera a cada hora: torneio novo/importado entra no sitemap sozinho.
export const revalidate = 3600;

/** URL de uma rota no idioma padrão (sem prefixo) e as alternativas (/es, /en), pro hreflang. */
function entry(path: string, lastModified?: string | null, priority = 0.6): MetadataRoute.Sitemap[number] {
  const base = siteUrl();
  const localized = (locale: string) =>
    locale === routing.defaultLocale ? `${base}${path}` : `${base}/${locale}${path === '/' ? '' : path}`;
  return {
    url: localized(routing.defaultLocale),
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, localized(l)])) },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Cliente anônimo simples (sem cookies): só lê o que a RLS já libera ao público,
  // e deixa a rota cacheável em vez de dinâmica por request.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const [{ data: tournaments }, { data: news }] = await Promise.all([
    supabase.from('tournaments')
      .select('slug, updated_at, status')
      .eq('is_public', true)
      .neq('status', 'draft')
      .order('start_date', { ascending: false })
      .limit(5000),
    supabase.from('news')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1000),
  ]);

  const fixed = [
    entry('/', null, 1),
    entry('/torneios', null, 0.9),
    entry('/agenda', null, 0.8),
    entry('/noticias', null, 0.5),
    entry('/players', null, 0.4),
  ];

  const tournamentEntries = (tournaments ?? []).flatMap((t) => {
    const base = `/torneios/${t.slug}`;
    return [
      entry(base, t.updated_at, 0.8),
      entry(`${base}/participants`, t.updated_at, 0.5),
      entry(`${base}/standings`, t.updated_at, 0.6),
    ];
  });

  const newsEntries = (news ?? []).map((n) => entry(`/noticias/${n.slug}`, n.updated_at ?? n.published_at, 0.5));

  return [...fixed, ...tournamentEntries, ...newsEntries];
}
