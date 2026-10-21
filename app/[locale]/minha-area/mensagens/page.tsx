import type { Metadata } from 'next';
import { redirect, Link } from '@/i18n/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/data/session';
import { PlayerAreaTabs } from '@/components/player-hub/player-area-tabs';
import { Gambito } from '@/components/mascot/gambito';

export const metadata: Metadata = { title: 'Mensagens', robots: { index: false } };

type SessionRow = {
  id: string;
  status: string;
  last_message_at: string;
  user_last_read_at: string | null;
  started_by: string | null;
};
type MessageRow = { session_id: string; role: string; content: string; is_human: boolean; created_at: string };

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Caixa de mensagens: todas as conversas do usuário com o Gambito (bot ou equipe), mais recente primeiro. */
export default async function MessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/minha-area/mensagens');
  const admin = createAdminClient();

  const { data: sessionsRaw } = await admin
    .from('chat_sessions')
    .select('id, status, last_message_at, user_last_read_at, started_by')
    .eq('user_id', user.id)
    .order('last_message_at', { ascending: false })
    .limit(100);
  const sessions = (sessionsRaw ?? []) as SessionRow[];

  // Mensagens das conversas listadas, para a prévia (última) e o contador de não lidas.
  const ids = sessions.map((s) => s.id);
  const { data: messagesRaw } = ids.length
    ? await admin.from('chat_messages').select('session_id, role, content, is_human, created_at').in('session_id', ids).order('created_at', { ascending: false }).limit(2000)
    : { data: [] };
  const messages = (messagesRaw ?? []) as MessageRow[];
  const lastBySession = new Map<string, MessageRow>();
  const unreadBySession = new Map<string, number>();
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const m of messages) {
    if (!lastBySession.has(m.session_id)) lastBySession.set(m.session_id, m);
    const s = sessionById.get(m.session_id);
    if (s && m.role === 'assistant' && m.is_human && (!s.user_last_read_at || m.created_at > s.user_last_read_at)) {
      unreadBySession.set(m.session_id, (unreadBySession.get(m.session_id) ?? 0) + 1);
    }
  }
  const withMessages = sessions.filter((s) => lastBySession.has(s.id));

  return (
    <div className="container-app py-8">
      <PlayerAreaTabs />
      <div className="mb-5 flex items-center gap-3">
        <Gambito pose="acenando" alt="" className="h-14 w-14" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Mensagens</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Suas conversas com o Gambito e os recados da equipe.</p>
        </div>
      </div>

      {withMessages.length === 0 ? (
        <div className="card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhuma conversa ainda. Toque no Gambito, no canto da tela, para tirar uma dúvida.
        </div>
      ) : (
        <ul className="card divide-y divide-gray-100 overflow-hidden p-0 dark:divide-gray-800">
          {withMessages.map((s) => {
            const last = lastBySession.get(s.id)!;
            const unread = unreadBySession.get(s.id) ?? 0;
            const fromTeam = s.started_by != null;
            const preview = `${last.role === 'user' ? 'Você: ' : ''}${last.content}`;
            return (
              <li key={s.id}>
                <Link
                  href={`/minha-area/mensagens/${s.id}`}
                  className={`flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40 ${unread ? 'bg-brand-50/60 dark:bg-brand-950/20' : ''}`}
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg text-white">♞</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-sm ${unread ? 'font-bold text-gray-900 dark:text-gray-100' : 'font-semibold text-gray-800 dark:text-gray-200'}`}>
                        Gambito{fromTeam && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Recado da equipe</span>}
                      </p>
                      <span className="shrink-0 text-xs text-gray-400">{when(s.last_message_at)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={`line-clamp-2 flex-1 text-sm ${unread ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>{preview}</p>
                      {unread > 0 && (
                        <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white">{unread}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
