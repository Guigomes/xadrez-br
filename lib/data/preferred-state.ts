import { cookies } from 'next/headers';
import { PREFERRED_STATE_COOKIE, parsePreferredState } from '@/lib/utils/preferred-state';

/** Estado escolhido no filtro de torneios (cookie pref_uf), no servidor. */
export async function getPreferredState(): Promise<string | null> {
  return parsePreferredState((await cookies()).get(PREFERRED_STATE_COOKIE)?.value);
}
