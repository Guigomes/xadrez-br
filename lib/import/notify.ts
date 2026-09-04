// Adaptado de ../../cron-import/src/notify.ts — lá o worker chama de fora
// via HTTP (CHESS_VIEWER_URL); aqui já ESTAMOS no chess-viewer, mas o
// caminho continua sendo HTTP contra a própria rota interna
// (/api/internal/notify-round) em vez de chamar a lógica de push direto —
// evita duplicar as guardas dessa rota (torneio público, data não passada,
// dedup por rounds.notified_at). Reaproveita NEXT_PUBLIC_APP_URL e
// CRON_PUSH_SECRET, ambos já existentes no ambiente do chess-viewer (a
// própria rota exige os dois pra aceitar a chamada do worker externo).

export async function notifyRoundPublished(roundId: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_PUSH_SECRET;
  if (!base || !secret) {
    console.warn('[notify] NEXT_PUBLIC_APP_URL/CRON_PUSH_SECRET ausente — push da rodada pulado');
    return;
  }

  const url = `${base.replace(/\/$/, '')}/api/internal/notify-round`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      body: JSON.stringify({ roundId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[notify] rodada ${roundId} falhou (${res.status}):`, JSON.stringify(body));
    } else {
      console.log(`[notify] rodada ${roundId}:`, JSON.stringify(body));
    }
  } catch (e) {
    console.error(`[notify] rodada ${roundId} erro de rede:`, (e as Error).message);
  }
}
