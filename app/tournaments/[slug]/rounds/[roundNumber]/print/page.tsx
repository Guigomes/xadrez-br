import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PrintFrame } from '@/components/tournament/print-frame';

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ slug: string; roundNumber: string }> }

export default async function RoundPrintPage({ params }: Props) {
  const { slug, roundNumber } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments').select('id, name').eq('slug', slug).single();
  if (!tournament) notFound();

  // Todas as rodadas com este número (um por grupo em torneios multi-grupo).
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, pairing_group_id, pairing_groups(name)')
    .eq('tournament_id', tournament.id)
    .eq('round_number', Number(roundNumber))
    .neq('status', 'draft');
  if (!rounds?.length) notFound();

  const sections = await Promise.all(
    rounds.map(async (r: any) => {
      const { data: pairings } = await supabase.rpc('get_round_pairings', { p_round_id: r.id });
      return { groupName: r.pairing_groups?.name ?? '—', pairings: pairings ?? [] };
    }),
  );

  return (
    <PrintFrame title={`${tournament.name} — Rodada ${roundNumber}`}>
      {sections.map((s) => (
        <section key={s.groupName} className="print-section">
          {sections.length > 1 && <h2>{s.groupName}</h2>}
          <table>
            <thead>
              <tr><th>Mesa</th><th>Brancas</th><th>Resultado</th><th>Pretas</th></tr>
            </thead>
            <tbody>
              {s.pairings.map((p: any) => (
                <tr key={p.pairing_id}>
                  <td>{p.board_number ?? '—'}</td>
                  <td className="name">{p.white_name}</td>
                  <td className="result">{p.is_bye ? 'BYE' : resultLabel(p.result)}</td>
                  <td className="name">{p.black_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </PrintFrame>
  );
}

function resultLabel(r: string): string {
  switch (r) {
    case '1-0': return '1 – 0';
    case '0-1': return '0 – 1';
    case '1/2-1/2': return '½ – ½';
    case 'forfeit_white': return 'WO (0–1)';
    case 'forfeit_black': return 'WO (1–0)';
    case 'double_forfeit': return 'WO duplo';
    default: return '___ – ___';
  }
}
