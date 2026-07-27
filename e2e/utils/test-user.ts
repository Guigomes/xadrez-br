import { randomUUID } from 'node:crypto';
import { adminClient } from './admin';

export interface TestOrganizer {
  id: string;
  email: string;
  password: string;
}

const PASSWORD = 'TesteJoyride2026!';

/**
 * Cria uma conta organizadora confirmada, sem passar pelo /login público.
 *
 * O signUp da tela esbarra no rate limit de email do Supabase (poucos envios
 * por hora no free tier, mesmo com "Confirm email" desligado — foi o que
 * bloqueou o teste manual desta feature). A Admin API não passa por esse
 * fluxo: email_confirm:true dispensa confirmação, e nenhum email é enviado.
 *
 * is_organizer vai direto no user_metadata porque é dali que a trigger
 * handle_new_user() (027_participant_capability.sql) lê o valor ao criar a
 * linha em user_profiles — não existe um UPDATE separado depois.
 */
export async function createTestOrganizer(): Promise<TestOrganizer> {
  const email = `xbr.e2e.${Date.now()}.${randomUUID().slice(0, 8)}@gmail.com`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Test Organizer', is_organizer: true },
  });
  if (error || !data.user) {
    throw new Error(`createTestOrganizer falhou: ${error?.message ?? 'sem usuário retornado'}`);
  }
  return { id: data.user.id, email, password: PASSWORD };
}

/**
 * Apaga a conta e tudo que ela criou.
 *
 * Ordem importa: tournaments.created_by NÃO tem "on delete cascade"
 * (001_initial_schema.sql) — apagar o usuário primeiro falha com violação de
 * FK enquanto existir torneio dele. Apagar o torneio primeiro cascadeia pra
 * rounds/pairings/categories/registrations (todos "on delete cascade" a
 * partir de tournaments); só então o usuário, que cascadeia pra
 * user_profiles ("on delete cascade" em auth.users).
 */
export async function deleteTestOrganizer(userId: string): Promise<void> {
  const admin = adminClient();
  const { error: tournamentsError } = await admin.from('tournaments').delete().eq('created_by', userId);
  if (tournamentsError) {
    throw new Error(`deleteTestOrganizer: falha ao apagar torneios — ${tournamentsError.message}`);
  }
  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) {
    throw new Error(`deleteTestOrganizer: falha ao apagar usuário — ${userError.message}`);
  }
}
