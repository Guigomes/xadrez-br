import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Lê o corpo JSON e valida com zod. JSON quebrado ou fora do schema vira 400
 * com mensagem curta — nunca o detalhe do zod nem do banco.
 *
 *   const parsed = await readJson(request, Schema);
 *   if (!parsed.ok) return parsed.response;
 *   parsed.data
 */
export async function readJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  message = 'Dados inválidos.',
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  const body = await request.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (!result.success) return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  return { ok: true, data: result.data };
}

export const uuid = z.string().uuid();

/**
 * Serviços de push dos navegadores. O servidor faz POST no `endpoint` de cada
 * inscrição (web-push); aceitar qualquer URL deixaria um visitante anônimo
 * apontar o servidor para endereço arbitrário (SSRF às cegas a cada aviso).
 * Chrome/Edge-Chromium/Samsung/Opera/Brave: FCM; Firefox: Mozilla; Edge legado: WNS; Safari: Apple.
 */
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
];

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
