import { createAdminClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/data/session';
import { EmptyState } from '@/components/ui/empty-state';
import { TUTORIAL_BUCKET, orderTutorials } from '@/lib/tutorials';

export const metadata = { title: 'Vídeos de tutorial', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Link assinado vale 1 h: dá para assistir inteiro, e quem não é admin nunca recebe um. */
const LINK_SECONDS = 3600;

export default async function AdminTutorialsPage() {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') {
    return <EmptyState icon="🔒" title="Acesso restrito" description="Este painel é exclusivo para administradores do sistema." />;
  }

  const storage = createAdminClient().storage.from(TUTORIAL_BUCKET);
  const { data: objects } = await storage.list('', { limit: 100 });
  const episodes = orderTutorials((objects ?? []).map((o) => o.name));
  const { data: signed } = episodes.length
    ? await storage.createSignedUrls(episodes.map((e) => e.file), LINK_SECONDS)
    : { data: [] };
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">🎬 Vídeos de tutorial</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Série do organizador, ainda em revisão: só administradores veem esta página. Os links dos vídeos expiram em 1 hora (recarregue a página
          para renovar).
        </p>
      </div>

      {episodes.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum vídeo enviado ainda.</p>
      ) : (
        <div className="space-y-6">
          {episodes.map((e) => {
            const url = urlOf.get(e.file);
            return (
              <section key={e.file} className="card p-4 space-y-3">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">{e.title}</h2>
                  {e.summary && <p className="text-sm text-gray-500 dark:text-gray-400">{e.summary}</p>}
                </div>
                {url ? (
                  <video controls preload="metadata" className="w-full max-w-3xl rounded-lg border border-gray-200 dark:border-gray-800 bg-black" src={url}>
                    Seu navegador não reproduz vídeo MP4.
                  </video>
                ) : (
                  <p className="text-sm text-red-600">Não foi possível gerar o link deste vídeo.</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
