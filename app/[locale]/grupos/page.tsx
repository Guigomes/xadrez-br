import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/data/session';
import { getEntitlements } from '@/lib/data/entitlements';
import { PlayerAreaTabs } from '@/components/player-hub/player-area-tabs';
import { CreateGroupForm } from '@/components/groups/group-actions';
import { GROUP_KIND_LABEL, type GroupKind } from '@/lib/groups/overview';

export const metadata: Metadata = {
  title: 'Grupos de jogadores',
  description: 'Acompanhe os jogadores do seu clube, escola ou alunos num só painel: ranking interno, atividade e partidas para revisar.',
};

type GroupRow = { id: string; name: string; kind: GroupKind; created_at: string; player_group_members: { count: number }[] };

export default async function GruposPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <div className="container-app max-w-3xl py-8 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Grupos de jogadores</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Para clubes, escolas e treinadores: junte seus jogadores num painel com ranking interno, atividade recente,
          partidas com lances para revisar e anotações privadas.
        </p>
        <Link href="/entrar?next=/grupos" className="inline-block text-sm font-medium text-brand-600 dark:text-brand-400 underline">Entrar para criar um grupo</Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data }, entitlements] = await Promise.all([
    supabase.from('player_groups').select('id, name, kind, created_at, player_group_members(count)').order('created_at'),
    getEntitlements(),
  ]);
  const groups = (data ?? []) as unknown as GroupRow[];
  const limit = entitlements.limitOf('groups.players');

  return (
    <div className="container-app max-w-3xl py-8 space-y-8">
      <PlayerAreaTabs />
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Grupos de jogadores</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Junte os jogadores do seu clube, escola ou seus alunos e acompanhe todos de uma vez.
          {limit !== null && <> Seu plano permite acompanhar até <strong>{limit}</strong> jogador(es) somando os grupos.</>}
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Novo grupo</h2>
        <CreateGroupForm />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Meus grupos</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Você ainda não criou nenhum grupo.</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/grupos/${g.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-900">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{g.name}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {GROUP_KIND_LABEL[g.kind]} · {g.player_group_members?.[0]?.count ?? 0} jogador(es)
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
