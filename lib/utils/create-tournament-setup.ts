import { createClient } from '@/lib/supabase/client';
import { generateClassificationCells } from './classification-match';
import type { AgePreset, RatingPreset } from '@/lib/constants/classification-presets';
import type { ClassificationDimension, TablesUpdate } from '@/types/database';

export interface ClassificationDraft {
  ageOn: boolean;
  ratingOn: boolean;
  femaleOn: boolean;
  /** 4ª pergunta (migration 065): se o torneio premia o absoluto. */
  absoluteOn: boolean;
  ageBands: AgePreset[];
  ratingBands: RatingPreset[];
}

/**
 * Grava de uma vez, na criação do torneio, o que o organizador respondeu no
 * rascunho de Classificação (app/admin/tournaments/new) — nada disso existe
 * em banco antes daqui, porque classificação tem FK pro torneio, que só
 * passa a existir depois do insert em `tournaments`. Mesma lógica de
 * components/admin/classification-setup.tsx, só que sem reconciliar contra
 * nada existente — aqui é tudo linha nova.
 *
 * Emparceiramento não é mais escolha da tela de criação — sempre nasce
 * como 'absolute' (grupo único "Absoluto"), e o organizador troca pra
 * por idade/rating/personalizado depois, na aba própria (app/admin/
 * tournaments/[slug]/groups). Torneio nativo não aceita participante sem
 * grupo (enforce_native_pairing_group), por isso o grupo "Absoluto" nasce
 * sempre, mesmo sem nenhuma classificação.
 */
export async function applyClassificationDraft(tournamentId: string, draft: ClassificationDraft): Promise<void> {
  const supabase = createClient();

  const dims: ClassificationDimension[] = [
    ...(draft.ageOn ? (['age'] as const) : []),
    ...(draft.ratingOn ? (['rating'] as const) : []),
    ...(draft.femaleOn ? (['sex'] as const) : []),
  ];
  const cells = generateClassificationCells({
    ageBands: draft.ageOn ? draft.ageBands : [],
    ratingBands: draft.ratingOn ? draft.ratingBands : [],
    female: draft.femaleOn,
  });

  // Absoluto desligado só faz sentido com faixa: sem nenhuma, ele é a única
  // classificação que existe e o torneio ficaria sem ranking pra mostrar. A
  // tela de criação já esconde a pergunta nesse caso — isto aqui é o cinto de
  // segurança pra qualquer caminho que mande absoluteOn=false sem faixa.
  const patch: TablesUpdate<'tournaments'> = {
    has_absolute_classification: cells.length > 0 ? draft.absoluteOn : true,
  };
  if (dims.length > 0) patch.classification_dimensions = dims;
  const { error: patchError } = await supabase
    .from('tournaments').update(patch).eq('id', tournamentId);
  if (patchError) throw patchError;

  let categories: { id: string; name: string; min_age: number | null; max_age: number | null; min_rating: number | null; max_rating: number | null }[] = [];
  if (cells.length > 0) {
    const rows = cells.map((c, i) => ({
      tournament_id: tournamentId,
      name: c.name,
      sex: c.sex,
      min_age: c.minAge,
      max_age: c.maxAge,
      min_rating: c.minRating,
      max_rating: c.maxRating,
      sort_order: i,
    }));
    const { data, error } = await supabase.from('tournament_categories').insert(rows).select();
    if (error) throw error;
    categories = data ?? [];
  }

  const { data: group, error } = await supabase
    .from('pairing_groups')
    .insert({ tournament_id: tournamentId, name: 'Absoluto', sort_order: 0 })
    .select('id').single();
  if (error) throw error;
  if (categories.length > 0) {
    const { error: linkError } = await supabase
      .from('tournament_categories')
      .update({ pairing_group_id: group.id })
      .in('id', categories.map((c) => c.id));
    if (linkError) throw linkError;
  }
  const { error: modeError } = await supabase
    .from('tournaments').update({ pairing_mode: 'absolute', pairing_split: null }).eq('id', tournamentId);
  if (modeError) throw modeError;
}
