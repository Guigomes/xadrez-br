import React from 'react';
import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from('tournament_players')
    .select('id, current_score, current_rank, players(full_name, title), tournaments(name, slug, is_public), tournament_categories(name)')
    .eq('id', id).maybeSingle();
  const row = data as unknown as {
    current_score: number; current_rank: number | null;
    players: { full_name: string; title: string | null } | null;
    tournaments: { name: string; slug: string; is_public: boolean } | null;
    tournament_categories: { name: string } | null;
  } | null;
  if (!row?.tournaments?.is_public || !row.players) return new Response('Não encontrado', { status: 404 });

  const h = React.createElement;
  return new ImageResponse(
    h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '72px', color: '#fff', background: 'linear-gradient(135deg,#071b13,#123c2b 60%,#8a5a13)', fontFamily: 'sans-serif' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('div', { style: { fontSize: 26, fontWeight: 800, letterSpacing: 3, color: '#9be7bd' } }, 'TORNEIOS XADREZ BR'),
        h('div', { style: { fontSize: 48 } }, '♞')
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { fontSize: 30, color: '#d1d5db', marginBottom: 16 } }, row.tournaments.name),
        h('div', { style: { fontSize: 62, lineHeight: 1.05, fontWeight: 900 } }, `${row.players.title ? `${row.players.title} ` : ''}${row.players.full_name}`),
        row.tournament_categories?.name ? h('div', { style: { marginTop: 18, fontSize: 25, color: '#fcd34d' } }, row.tournament_categories.name) : null
      ),
      h('div', { style: { display: 'flex', gap: 30 } },
        h('div', { style: { display: 'flex', flexDirection: 'column', padding: '22px 34px', borderRadius: 24, background: 'rgba(255,255,255,.1)' } },
          h('span', { style: { fontSize: 20, color: '#d1d5db' } }, 'COLOCAÇÃO'),
          h('strong', { style: { fontSize: 54 } }, row.current_rank ? `${row.current_rank}º` : '—')
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', padding: '22px 34px', borderRadius: 24, background: 'rgba(255,255,255,.1)' } },
          h('span', { style: { fontSize: 20, color: '#d1d5db' } }, 'PONTOS'),
          h('strong', { style: { fontSize: 54 } }, String(row.current_score))
        )
      )
    ),
    { width: 1200, height: 630 }
  );
}
