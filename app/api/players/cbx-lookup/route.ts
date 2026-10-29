import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchCbxProfile } from '@/lib/cbx/profile';
import { BR_STATES } from '@/lib/utils/chess';
import type { CbxLookupResult } from '@/lib/cbx/lookup';

// Parte dos cadastros importados do chess-results veio com cidade e escola trocadas
// (cidade "E.M. Aviador…", escola "Campo Grande"). Desfaz a troca antes de preencher o
// formulário; nome de estado no lugar da cidade ("Mato Grosso Do Sul") é descartado.
const SCHOOL_LIKE = /^(e\.?\s?[a-z]\.|e\.?[a-z]\.?\s|ep\s|c\.|col[eé]gio|escola|instituto|clube)/i;
const STATE_NAMES = new Set(BR_STATES.map((s) => s.name.toLowerCase()));
function fixSwappedPlace(city: string | null, club: string | null) {
  if (!city || !SCHOOL_LIKE.test(city) || (club && SCHOOL_LIKE.test(club))) return { city, club };
  return { city: club && !STATE_NAMES.has(club.toLowerCase()) ? club : null, club: city };
}

/**
 * Autopreenchimento do formulário de inscrição pelo ID CBX (público, inclusive
 * anônimo). Procura primeiro em `players` — leitura já pública pela RLS
 * (`players_select_public`), então nada novo é exposto — e consulta o perfil na CBX
 * quando não há cadastro interno ou ele está incompleto. Nunca grava nada.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim() ?? '';
  if (!/^\d{1,9}$/.test(id)) {
    return NextResponse.json({ error: 'ID CBX inválido.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: player } = await supabase
    .from('players')
    .select('full_name, birth_year, sex, city, state, club_or_school, federation, fide_id')
    .eq('cbx_id', id)
    .eq('is_test', false)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (player) {
    const place = fixSwappedPlace(player.city, player.club_or_school);
    const result: CbxLookupResult = {
      source: 'gambito',
      ...player,
      city: place.city,
      club_or_school: place.club,
      sex: player.sex === 'm' || player.sex === 'w' ? player.sex : null,
    };
    // Cadastro importado costuma vir só com o nome (sem nascimento, UF, FIDE): completa o
    // que falta com o perfil da CBX, sem trocar nada que o cadastro já tem. Melhor esforço —
    // se a CBX não responder, devolve o cadastro como está.
    if (result.birth_year == null || result.state == null || result.fide_id == null) {
      try {
        const cbx = await fetchCbxProfile(id);
        if (cbx) {
          const filled = {
            birth_year: result.birth_year ?? cbx.birthYear,
            state: result.state ?? cbx.state,
            fide_id: result.fide_id ?? cbx.fideId,
          };
          if (filled.birth_year !== result.birth_year || filled.state !== result.state || filled.fide_id !== result.fide_id) {
            Object.assign(result, filled, { source: 'cbx' });
          }
        }
      } catch { /* CBX fora do ar: segue só com o cadastro */ }
    }
    return NextResponse.json(result);
  }

  let cbx: Awaited<ReturnType<typeof fetchCbxProfile>>;
  try {
    cbx = await fetchCbxProfile(id);
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar a CBX agora.' }, { status: 502 });
  }
  if (!cbx) return NextResponse.json({ error: 'ID CBX não encontrado.' }, { status: 404 });

  const result: CbxLookupResult = {
    source: 'cbx',
    full_name: cbx.playerName,
    birth_year: cbx.birthYear,
    sex: null,
    city: null,
    state: cbx.state,
    club_or_school: null,
    federation: 'BRA',
    fide_id: cbx.fideId,
  };
  return NextResponse.json(result);
}
