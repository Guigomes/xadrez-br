import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { getSessionProfile } from '@/lib/data/session';
import { lichessBroadcastEmbedUrl } from '@/lib/utils/live-broadcast';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTournamentPageData(slug);
  return { title: data ? `Ao vivo — ${data.tournament.name}` : 'Ao vivo' };
}

/**
 * Aba "Acompanhe ao Vivo": a transmissão que a ORGANIZAÇÃO do torneio oferece (hoje, o
 * broadcast do Lichess). A gente só compartilha o link — o aviso no topo deixa isso claro.
 * Lichess abre embutido logo abaixo; qualquer outro serviço, só pelo botão de nova aba
 * (ver lichessBroadcastEmbedUrl).
 */
export default async function LiveBroadcastPage({ params }: Props) {
  const { slug } = await params;
  const data = await getTournamentPageData(slug);
  const url = data?.tournament.live_broadcast_url;
  if (!data || !url) notFound();
  // Em teste: só o desenvolvedor (perfil admin). Pros demais a página nem existe.
  if ((await getSessionProfile())?.role !== 'admin') notFound();

  const embedUrl = lichessBroadcastEmbedUrl(url);
  const isLichess = !!embedUrl;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-semibold">Transmissão oferecida pela organização do torneio</p>
        <p className="mt-1">
          Esta transmissão é feita pela organização do torneio{isLichess ? ' no Lichess' : ''}. O Gambito
          Torneios apenas compartilha o link — lances, horários e disponibilidade são de responsabilidade
          da organização{isLichess ? ' e do Lichess' : ''}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
        >
          Abrir transmissão em nova aba
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        {isLichess && (
          <span className="text-xs text-gray-500 dark:text-gray-400">ou acompanhe aqui mesmo, logo abaixo.</span>
        )}
      </div>

      {embedUrl ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <iframe
            src={embedUrl}
            title="Transmissão ao vivo no Lichess"
            className="block h-[80vh] min-h-[520px] w-full"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Esta transmissão não pode ser exibida dentro do site — use o botão acima para abri-la.
        </p>
      )}
    </div>
  );
}
