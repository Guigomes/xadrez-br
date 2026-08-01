import { createClient } from '@/lib/supabase/client';
import { generateClassificationCells } from './classification-match';
import type { AgePreset, RatingPreset } from '@/lib/constants/classification-presets';
import type { ClassificationDimension } from '@/types/database';

export type DraftPairingChoice = 'absolute' | 'age' | 'rating' | 'custom';

export interface ClassificationDraft {
  ageOn: boolean;
  ratingOn: boolean;
  femaleOn: boolean;
  ageBands: AgePreset[];
  ratingBands: RatingPreset[];
  pairingChoice: DraftPairingChoice;
}

/**
 * Grava de uma vez, na criação do torneio, o que o organizador respondeu no
 * rascunho de Classificação e Emparceiramento (app/admin/tournaments/new) —
 * nada disso existe em banco antes daqui, porque classificação e grupo de
 * emparceiramento têm FK pro torneio, que só passa a existir depois do
 * insert em `tournaments`. Mesma lógica de app/admin/tournaments/[slug]/
 * groups (agora components/admin/classification-setup.tsx), só que sem
 * reconciliar contra nada existente — aqui é tudo linha nova.
 *
 * Cria pelo menos um grupo de emparceiramento (mesmo sem nenhuma
 * classificação) — torneio nativo não aceita participante sem grupo.
 * Exceção: pairingChoice 'custom' não cria grupo nenhum aqui, porque o
 * organizador vai mapear classificação -> grupo na hora (mesma tela,
 * ClassificationSetup embutido) — torneio fica sem grupo até isso acontecer.
 */
export async function applyClassificationDraft(tournamentId: string, draft: ClassificationDraft): Promise<void> {
  const supabase = createClient();

  const dims: ClassificationDimension[] = [
    ...(draft.ageOn ? (['age'] as const) : []),
    ...(draft.ratingOn ? (['rating'] as const) : []),
    ...(draft.femaleOn ? (['sex'] as const) : []),
  ];
  if (dims.length > 0) {
    const { error } = await supabase
      .from('tournaments').update({ classification_dimensions: dims }).eq('id', tournamentId);
    if (error) throw error;
  }

  const cells = generateClassificationCells({
    ageBands: draft.ageOn ? draft.ageBands : [],
    ratingBands: draft.ratingOn ? draft.ratingBands : [],
    female: draft.femaleOn,
  });

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

  // 'custom': organizador vai mapear grupo por classificação na hora (aba
  // Editar reaproveitada aqui mesmo, embutida na tela de criação) — sem
  // grupo automático, igual ao applyCustom() de components/admin/
  // classification-setup.tsx. Torneio fica temporariamente sem grupo até o
  // organizador criar um manualmente (players/page.tsx já cobre esse estado).
  if (draft.pairingChoice === 'custom') {
    const { error: modeError } = await supabase
      .from('tournaments').update({ pairing_mode: 'custom', pairing_split: null }).eq('id', tournamentId);
    if (modeError) throw modeError;
    return;
  }

  // pairingChoice 'age'/'rating' só faz sentido com classificações usando
  // aquela dimensão — sem isso (ou sem nenhuma classificação), cai no grupo
  // único, igual ao "Não — todos juntos" da tela ao vivo.
  const splitDim: 'age' | 'rating' | null =
    draft.pairingChoice !== 'absolute' && categories.length > 0 ? draft.pairingChoice : null;

  if (splitDim === null) {
    const { data: group, error } = await supabase
      .from('pairing_groups')
      .insert({ tournament_id: tournamentId, name: 'Único', sort_order: 0 })
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
  } else {
    // Um grupo por FAIXA da dimensão escolhida — não por classificação, pra
    // "Sub-17" e "Sub-17 Feminino" (mesma faixa de idade) caírem no mesmo
    // grupo. Mesmo critério de components/admin/classification-setup.tsx.
    const bands = new Map<string, { label: string; catIds: string[] }>();
    for (const c of categories) {
      const key = splitDim === 'age' ? `${c.min_age ?? ''}:${c.max_age ?? ''}` : `${c.min_rating ?? ''}:${c.max_rating ?? ''}`;
      const hasBand = splitDim === 'age' ? (c.min_age != null || c.max_age != null) : (c.min_rating != null || c.max_rating != null);
      if (!hasBand) continue;
      if (!bands.has(key)) bands.set(key, { label: c.name.replace(/\s+Feminino$/, ''), catIds: [] });
      bands.get(key)!.catIds.push(c.id);
    }
    let i = 0;
    for (const [, band] of bands) {
      const { data: group, error } = await supabase
        .from('pairing_groups')
        .insert({ tournament_id: tournamentId, name: band.label, sort_order: i })
        .select('id').single();
      if (error) throw error;
      const { error: linkError } = await supabase
        .from('tournament_categories').update({ pairing_group_id: group.id }).in('id', band.catIds);
      if (linkError) throw linkError;
      i++;
    }
    const { error: modeError } = await supabase
      .from('tournaments').update({ pairing_mode: 'per_category', pairing_split: splitDim }).eq('id', tournamentId);
    if (modeError) throw modeError;
  }
}
