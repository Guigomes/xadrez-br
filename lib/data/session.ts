import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface SessionProfile {
  role: UserRole;
  full_name: string | null;
  is_organizer: boolean;
  is_arbiter: boolean;
  is_participant: boolean;
}

/**
 * Usuário autenticado do request atual.
 *
 * `supabase.auth.getUser()` vai à REDE a cada chamada (valida o token no
 * servidor de auth — não é leitura de cookie), e o caminho de render de uma
 * rota do painel chamava isso 3-4 vezes: layout raiz, layout do admin, e a
 * própria página. `cache()` do React memoiza por request, então só a primeira
 * paga o round-trip; as seguintes voltam do cache dentro do mesmo render.
 *
 * O middleware (`lib/supabase/middleware.ts`) tem o seu próprio getUser e fica
 * de fora — roda em outro contexto de execução, antes do render, e é ele que
 * revalida/renova o cookie da sessão.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
});

/**
 * Perfil (`user_profiles`) do usuário autenticado, ou null se não há sessão.
 *
 * Mesmo motivo do `getSessionUser`: `user_profiles` era consultada de novo em
 * cada camada que precisava saber `role`/`is_organizer`. Depende de
 * `getSessionUser`, então as duas juntas custam no máximo 2 round-trips por
 * request em vez de crescerem com o número de camadas.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('user_profiles')
    .select('role, full_name, is_organizer, is_arbiter, is_participant')
    .eq('id', user.id)
    .single();

  return (data as SessionProfile | null) ?? null;
});
