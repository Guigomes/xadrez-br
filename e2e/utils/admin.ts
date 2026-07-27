import { createClient } from '@supabase/supabase-js';

/**
 * Cliente com service_role, para uso exclusivo dos testes E2E.
 *
 * Não importa de lib/supabase/server.ts de propósito: aquele arquivo tem
 * createAdminClient() (o que precisamos) no mesmo módulo que createClient(),
 * que usa next/headers — importar o arquivo inteiro fora de uma request do
 * Next quebra. Aqui é só supabase-js puro, sem dependência do framework.
 */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar em .env.local para rodar e2e/'
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
