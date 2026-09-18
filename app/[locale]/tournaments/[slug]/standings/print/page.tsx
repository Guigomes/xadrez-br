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
    .from('tournaments').select('id, name, has_absolute_classification').eq('slug', slug).single();
  if (!tournament) notFound();

  const { data: rows } = await supabase.rpc('get_tournament_standings', {
    p_tournament_id: tournament.id,
  });

  // Agrupa por grupo de emparceiramento
  const groups = new Map<string, any[]>();
  for (const r of rows ?? []) {
    const key = r.pairing_group_name ?? '—';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  return (
    <PrintFrame title={`Classificação — ${tournament.name}`}>
      {[...groups.entries()].map(([groupName, list]) => {
        // Classificações (células derivadas) presentes neste grupo — mesma
        // lógica da tela de standings: absoluto primeiro, depois cada célula
        // com rank renumerado dentro dela.
        const categories = new Map<string, string>();
        for (const r of list) {
          if (r.category_id && r.category_name && !categories.has(r.category_id)) {
            categories.set(r.category_id, r.category_name);
          }
        }

        // Mesma regra da tela de standings (migration 065): torneio que não
        // premia o absoluto imprime só as faixas — a não ser que não haja
        // faixa, e aí o absoluto é a única classificação que existe.
        const showAbsolute =
          tournament.has_absolute_classification !== false || categories.size === 0;

        return (
          <section key={groupName} className="print-section">
            {groups.size > 1 && <h2>{groupName}</h2>}
            {showAbsolute && (
              <StandingsPrintTable title={categories.size > 0 ? 'Absoluto' : undefined} rows={list} />
            )}
            {[...categories.entries()].map(([catId, catName]) => (
              <StandingsPrintTable
                key={catId}
                title={catName}
                rows={list.filter((r) => r.category_id === catId).map((r, i) => ({ ...r, rank: i + 1 }))}
              />
            ))}
          </section>
        );
      })}
    </PrintFrame>
  );
}

function StandingsPrintTable({ title, rows }: { title?: string; rows: any[] }) {
  return (
    <>
      {title && <h3>{title}</h3>}
      <table>
        <thead>
          <tr>
            <th>#</th><th>Nome</th><th>Rating</th><th>Pts</th>
            <th>BH</th><th>BH-1</th><th>SB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
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
    </>
  );
}
