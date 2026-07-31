'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageSpinner } from '@/components/ui/spinner';

/**
 * Classificação e Emparceiramento migraram pra dentro da aba Editar
 * (components/admin/classification-setup.tsx, renderizado em edit/page.tsx).
 * Esta rota fica só como redirect — bookmarks e o redirect pós-criação
 * (app/admin/tournaments/new/page.tsx) ainda existiam apontando pra cá.
 */
export default function GroupsRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/tournaments/${slug}/edit`);
  }, [router, slug]);

  return <PageSpinner />;
}
