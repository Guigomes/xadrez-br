import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/data/session';
import { findOwnChatSession } from '@/lib/chat/session-access';
import { PlayerAreaTabs } from '@/components/player-hub/player-area-tabs';
import { ConversationView } from '@/components/messages/conversation-view';

export const metadata: Metadata = { title: 'Conversa', robots: { index: false } };

interface Props {
  params: Promise<{ id: string }>;
}

/** Uma conversa da caixa de mensagens. Só o dono abre (a leitura no cliente também passa pela RLS). */
export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/minha-area/mensagens/${id}`);
  const own = await findOwnChatSession<{ id: string; started_by: string | null }>(createAdminClient(), id, user!.id, 'id, started_by');
  if (!own) notFound();

  return (
    <div className="container-app py-8">
      <PlayerAreaTabs />
      <ConversationView sessionId={own.id} fromTeam={own.started_by != null} />
    </div>
  );
}
