import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { ClassificationDimension, SeriesStatus } from '@/types/database';

export interface SeriesHeader {
  name: string;
  description: string | null;
  status: SeriesStatus;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  organizer_name: string | null;
  classification_dimensions: ClassificationDimension[];
}

/**
 * Cabeçalho da série, memoizado por request.
 *
 * Mesmo padrão de lib/data/tournament-page-data.ts: `generateMetadata` e o
 * layout pediam a MESMA linha em duas consultas separadas a cada navegação
 * entre abas da série. Com `cache()` a segunda volta da memória.
 *
 * RLS já esconde rascunho de quem não gerencia — sem linha aqui significa 404
 * pro visitante e página normal pro organizador.
 */
export const getSeriesHeader = cache(async (slug: string): Promise<SeriesHeader | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tournament_series')
    .select('name, description, status, start_date, end_date, city, state, organizer_name, classification_dimensions')
    .eq('slug', slug)
    .single();

  return (data as SeriesHeader | null) ?? null;
});
