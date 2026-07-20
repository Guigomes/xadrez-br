import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PrintFrame } from '@/components/tournament/print-frame';
import { formatScore } from '@/lib/utils/chess';

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ slug: string }> }

export default async function StandingsPrintPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments').select('id, name').eq('slug', slug).single();
  if (!tournament) notFound();

  const { data: rows } = await supabase.rpc('get_tournament_standings', {
    p_tournament_id: tournament.id,
  });

  // Agrupa por grupo de pareamento
  const groups = new Map<string, any[]>();
  for (const r of rows ?? []) {
    const key = r.pairing_group_name ?? '—';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  return (
    <PrintFrame title={`Classificação — ${tournament.name}`}>
      {[...groups.entries()].map(([groupName, list]) => (
        <section key={groupName} className="print-section">
          {groups.size > 1 && <h2>{groupName}</h2>}
          <table>
            <thead>
              <tr>
                <th>#</th><th>Nome</th><th>Rating</th><th>Pts</th>
                <th>BH</th><th>BH-1</th><th>SB</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r: any) => (
                <tr key={r.tp_id}>
                  <td>{r.rank}</td>
                  <td className="name">{r.full_name}</td>
                  <td>{r.rating_std ?? '—'}</td>
                  <td className="pts">{formatScore(r.points)}</td>
                  <td>{r.buchholz ?? '—'}</td>
                  <td>{r.buchholz_cut1 ?? '—'}</td>
                  <td>{r.sonneborn_berger ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </PrintFrame>
  );
}
