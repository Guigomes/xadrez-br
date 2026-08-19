import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminSeriesChrome } from '@/components/admin/admin-series-chrome';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function AdminSeriesLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: series } = await supabase
    .from('tournament_series')
    .select('id, name, status')
    .eq('slug', slug)
    .single();

  if (!series) notFound();

  // Duas contagens em head:true (sem trazer linha) pra decidir se "Publicar"
  // pode ser clicado — série sem tabela de pontos ou sem etapa publicaria uma
  // classificação vazia.
  const [{ count: rulesCount }, { count: stageCount }] = await Promise.all([
    supabase.from('series_points_rules').select('id', { count: 'exact', head: true })
      .eq('series_id', series.id),
    supabase.from('series_tournaments').select('id', { count: 'exact', head: true })
      .eq('series_id', series.id),
  ]);

  return (
    <div>
      <AdminSeriesChrome
        id={series.id}
        slug={slug}
        name={series.name}
        status={series.status}
        hasPointsRules={(rulesCount ?? 0) > 0}
        stageCount={stageCount ?? 0}
      />
      {children}
    </div>
  );
}
