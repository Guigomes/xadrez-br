'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTournamentRounds } from '@/lib/hooks/use-tournament';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup } from '@/lib/hooks/use-native-rounds';
import {
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, useSetPairingMode,
  useSetClassificationDimensions, useSetPairingSplit, useBulkCreateCategories, useRefreshCategories,
  type CategoryInput,
} from '@/lib/hooks/use-classifications';
import { generateClassificationCells } from '@/lib/utils/classification-match';
import {
  AGE_PRESETS, RATING_PRESETS, CLASSIFICATION_COUNT_WARNING_THRESHOLD,
  type AgePreset, type RatingPreset,
} from '@/lib/constants/classification-presets';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { DimensionQuestion, Chip, CustomRangeForm, ModeOption } from '@/components/admin/classification-ui';
import type {
  PairingMode, TournamentCategory, PairingGroup, ClassificationDimension, TournamentMode,
} from '@/types/database';

interface ClassificationSetupProps {
  tournamentId: string;
  mode: TournamentMode;
  defaultRounds: number;
  currentMode: PairingMode;
  currentSplit: ClassificationDimension | null;
  initialDimensions: ClassificationDimension[];
}

/** Bloco de classificação + emparceiramento, embutido na aba Editar (junto de criação/edição). */
export function ClassificationSetup({
  tournamentId, mode, defaultRounds, currentMode, currentSplit, initialDimensions,
}: ClassificationSetupProps) {
  if (mode !== 'native') {
    return (
      <EmptyState
        icon="🔄"
        title="Torneio importado"
        description="Classificações e grupos de torneios importados vêm da origem (chess-results)."
      />
    );
  }

  return (
    <Setup
      tournamentId={tournamentId}
      defaultRounds={defaultRounds}
      currentMode={currentMode}
      currentSplit={currentSplit}
      initialDimensions={initialDimensions}
    />
  );
}

// Chave de faixa usada pra achar quantas faixas distintas de uma dimensão as
// classificações existentes têm — é isso que vira "1 grupo por faixa" no
// emparceiramento (mesma faixa em "Sub-17" e "Sub-17 Feminino" = mesmo grupo).
function bandKey(dim: 'age' | 'rating', c: TournamentCategory): string | null {
  if (dim === 'age') {
    if (c.min_age == null && c.max_age == null) return null;
    return `${c.min_age ?? ''}:${c.max_age ?? ''}`;
  }
  if (c.min_rating == null && c.max_rating == null) return null;
  return `${c.min_rating ?? ''}:${c.max_rating ?? ''}`;
}

function bandLabel(c: TournamentCategory): string {
  return c.name.replace(/\s+Feminino$/, '');
}

// Reconstrói a seleção de chips (idade/rating) a partir do que já existe em
// banco — sem isso, reabrir esta tela mostraria todos os chips como
// desmarcados mesmo com classificações já geradas, e desmarcar um chip pra
// excluir (ver toggleAgePreset/toggleRatingPreset) começaria do estado errado.
// Faixa sem preset correspondente (criada por "+ adicionar classificação
// manualmente" com idade/rating) também entra — vira um chip extra, mesmo
// mecanismo de exclusão.
function ageBandsFromCategories(cats: TournamentCategory[]): AgePreset[] {
  const seen = new Map<string, AgePreset>();
  for (const c of cats) {
    if (c.min_age == null && c.max_age == null) continue;
    const key = `${c.min_age ?? ''}:${c.max_age ?? ''}`;
    if (seen.has(key)) continue;
    const preset = AGE_PRESETS.find((p) => p.minAge === c.min_age && p.maxAge === c.max_age);
    seen.set(key, preset ?? { name: bandLabel(c), minAge: c.min_age, maxAge: c.max_age });
  }
  return Array.from(seen.values());
}
function ratingBandsFromCategories(cats: TournamentCategory[]): RatingPreset[] {
  const seen = new Map<string, RatingPreset>();
  for (const c of cats) {
    if (c.min_rating == null && c.max_rating == null) continue;
    const key = `${c.min_rating ?? ''}:${c.max_rating ?? ''}`;
    if (seen.has(key)) continue;
    const preset = RATING_PRESETS.find((p) => p.minRating === c.min_rating && p.maxRating === c.max_rating);
    seen.set(key, preset ?? { name: bandLabel(c), minRating: c.min_rating, maxRating: c.max_rating });
  }
  return Array.from(seen.values());
}

type PairingChoice = 'absolute' | 'age' | 'rating' | 'custom';

function Setup({
  tournamentId, defaultRounds, currentMode, currentSplit, initialDimensions,
}: {
  tournamentId: string; defaultRounds: number; currentMode: PairingMode;
  currentSplit: ClassificationDimension | null;
  initialDimensions: ClassificationDimension[];
}) {
  const { data: categories, isLoading: loadingCats } = useCategories(tournamentId);
  const { data: groups, isLoading: loadingGroups } = useGroups(tournamentId);
  const createCategory = useCreateCategory(tournamentId);
  const updateCategory = useUpdateCategory(tournamentId);
  const deleteCategory = useDeleteCategory(tournamentId);
  const createGroup = useCreateGroup(tournamentId);
  const setMode = useSetPairingMode(tournamentId);
  const setDimensions = useSetClassificationDimensions(tournamentId);
  const setPairingSplit = useSetPairingSplit(tournamentId);
  const bulkCreate = useBulkCreateCategories(tournamentId);
  const refreshCategories = useRefreshCategories(tournamentId);

  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null);
  const [classificationsSaved, setClassificationsSaved] = useState(false);

  // Emparceiramento: seleção fica local até "Salvar" — clicar num card só
  // marcava e já persistia na hora, sem nenhum retorno visual de que salvou;
  // ficava parecendo que não tinha feito nada. Agora clique só seleciona,
  // salvar é uma ação explícita com confirmação.
  // pairing_split aceita 'sex' no schema (approve_registration sabe lidar com
  // isso), mas esta tela só oferece dividir por idade/rating — se vier 'sex'
  // por algum outro caminho, cai em 'age' como seleção inicial padrão.
  const savedChoice: PairingChoice =
    currentMode === 'per_category' ? (currentSplit === 'rating' ? 'rating' : 'age') : currentMode;
  const [pendingChoice, setPendingChoice] = useState<PairingChoice>(savedChoice);
  const [pairingSaved, setPairingSaved] = useState(false);

  // Bloco 1 — as 3 perguntas.
  const [ageOn, setAgeOn] = useState(initialDimensions.includes('age'));
  const [ratingOn, setRatingOn] = useState(initialDimensions.includes('rating'));
  const [femaleOn, setFemaleOn] = useState(initialDimensions.includes('sex'));
  const [ageBands, setAgeBands] = useState<AgePreset[]>([]);
  const [ratingBands, setRatingBands] = useState<RatingPreset[]>([]);
  const [customAge, setCustomAge] = useState({ name: '', min: '', max: '' });
  const [customRating, setCustomRating] = useState({ name: '', min: '', max: '' });

  const [showManual, setShowManual] = useState(false);
  const [name, setName] = useState('');
  const [sex, setSex] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [minRating, setMinRating] = useState('');
  const [maxRating, setMaxRating] = useState('');

  // Definidos antes de qualquer return condicional (regra dos hooks) —
  // categories/groups ainda podem ser undefined durante o carregamento, mas
  // "?? []" já cobre isso sem precisar esperar o guard de loading.
  const cats = categories ?? [];
  const grps = groups ?? [];

  // useMemo precisa vir antes de qualquer return condicional (regra dos hooks).
  const previewCells = useMemo(
    () => generateClassificationCells({
      ageBands: ageOn ? ageBands : [],
      ratingBands: ratingOn ? ratingBands : [],
      female: femaleOn,
    }),
    [ageOn, ratingOn, femaleOn, ageBands, ratingBands]
  );

  // Esta seção fica embutida na aba Editar, destino do redirect logo após
  // criar um torneio — o formulário de criação é longo, o organizador clica
  // "Criar torneio" já scrolado lá embaixo. O scroll-to-top do App Router roda
  // enquanto aqui ainda só existe o spinner (página curta, nada pra
  // scrollar); quando os dados chegam e o conteúdo cresce, a posição antiga
  // volta a valer e a tela aparece no meio. Força o topo quando o conteúdo
  // real termina de montar.
  const contentReady = !loadingCats && !loadingGroups;
  useEffect(() => {
    if (contentReady) window.scrollTo(0, 0);
  }, [contentReady]);

  // Semeia os chips de idade/rating a partir do que já existe em banco — só
  // roda uma vez, quando os dados chegam (contentReady vira true e fica).
  // Depois disso, chips e banco ficam sincronizados pelas próprias mutações
  // de toggle (ver toggleAgePreset/toggleRatingPreset/toggleAgeOn/etc.), não
  // por re-sincronizar aqui de novo — senão uma exclusão em andamento
  // reapareceria no próximo refetch antes do delete confirmar.
  useEffect(() => {
    if (!contentReady) return;
    setAgeBands(ageBandsFromCategories(cats));
    setRatingBands(ratingBandsFromCategories(cats));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentReady]);

  if (loadingCats || loadingGroups) return <PageSpinner />;

  const existingNames = new Set(cats.map((c) => c.name.trim().toLowerCase()));
  const missingCells = previewCells.filter((c) => !existingNames.has(c.name.trim().toLowerCase()));

  // Desmarcar um chip que já tem classificação gerada EXCLUI na hora — não
  // existe botão "Excluir" separado nem confirmação extra, o clique no chip
  // já é a ação deliberada. Marcar só atualiza a seleção local; a criação de
  // verdade continua acontecendo em "Salvar classificações".
  async function deleteCatsMatching(pred: (c: TournamentCategory) => boolean) {
    const toDelete = cats.filter(pred);
    if (toDelete.length === 0) return;
    try {
      await Promise.all(toDelete.map((c) => deleteCategory.mutateAsync(c.id)));
    } catch (e: any) { setError(e.message); }
  }

  async function toggleAgePreset(preset: AgePreset) {
    setClassificationsSaved(false);
    const isActive = ageBands.some((b) => b.name === preset.name);
    setAgeBands((prev) => (isActive ? prev.filter((b) => b.name !== preset.name) : [...prev, preset]));
    if (isActive) {
      const key = `${preset.minAge ?? ''}:${preset.maxAge ?? ''}`;
      await deleteCatsMatching((c) => `${c.min_age ?? ''}:${c.max_age ?? ''}` === key);
    }
  }
  async function toggleRatingPreset(preset: RatingPreset) {
    setClassificationsSaved(false);
    const isActive = ratingBands.some((b) => b.name === preset.name);
    setRatingBands((prev) => (isActive ? prev.filter((b) => b.name !== preset.name) : [...prev, preset]));
    if (isActive) {
      const key = `${preset.minRating ?? ''}:${preset.maxRating ?? ''}`;
      await deleteCatsMatching((c) => `${c.min_rating ?? ''}:${c.max_rating ?? ''}` === key);
    }
  }
  async function toggleAgeOn() {
    setClassificationsSaved(false);
    const next = !ageOn;
    setAgeOn(next);
    if (!next) {
      setAgeBands([]);
      await deleteCatsMatching((c) => c.min_age != null || c.max_age != null);
    }
  }
  async function toggleRatingOn() {
    setClassificationsSaved(false);
    const next = !ratingOn;
    setRatingOn(next);
    if (!next) {
      setRatingBands([]);
      await deleteCatsMatching((c) => c.min_rating != null || c.max_rating != null);
    }
  }
  async function toggleFemale() {
    setClassificationsSaved(false);
    const next = !femaleOn;
    setFemaleOn(next);
    if (!next) await deleteCatsMatching((c) => c.sex === 'w');
  }
  function addCustomAge() {
    if (!customAge.name.trim()) { setError('Informe o nome da faixa de idade.'); return; }
    setError('');
    setClassificationsSaved(false);
    setAgeBands((prev) => [...prev, {
      name: customAge.name.trim(),
      minAge: customAge.min ? Number(customAge.min) : null,
      maxAge: customAge.max ? Number(customAge.max) : null,
    }]);
    setCustomAge({ name: '', min: '', max: '' });
  }
  function addCustomRating() {
    if (!customRating.name.trim()) { setError('Informe o nome da faixa de rating.'); return; }
    setError('');
    setClassificationsSaved(false);
    setRatingBands((prev) => [...prev, {
      name: customRating.name.trim(),
      minRating: customRating.min ? Number(customRating.min) : null,
      maxRating: customRating.max ? Number(customRating.max) : null,
    }]);
    setCustomRating({ name: '', min: '', max: '' });
  }

  async function generate() {
    setApplying(true);
    setError('');
    setUnmatchedCount(null);
    setClassificationsSaved(false);
    try {
      const dims: ClassificationDimension[] = [
        ...(ageOn ? (['age'] as const) : []),
        ...(ratingOn ? (['rating'] as const) : []),
        ...(femaleOn ? (['sex'] as const) : []),
      ];
      await setDimensions.mutateAsync(dims);

      if (missingCells.length > 0) {
        const inputs: CategoryInput[] = missingCells.map((c) => ({
          name: c.name, sex: c.sex, min_age: c.minAge, max_age: c.maxAge,
          min_rating: c.minRating, max_rating: c.maxRating,
        }));
        await bulkCreate.mutateAsync({ cells: inputs, startOrder: cats.length });
      }

      const unmatched = await refreshCategories.mutateAsync();
      setUnmatchedCount(unmatched);
      setClassificationsSaved(true);
    } catch (e: any) { setError(e.message); }
    finally { setApplying(false); }
  }

  async function addCategory() {
    if (name.trim().length < 1) { setError('Informe o nome da classificação.'); return; }
    setError('');
    try {
      await createCategory.mutateAsync({
        name,
        sex: (sex || null) as 'm' | 'w' | null,
        min_age: minAge ? Number(minAge) : null,
        max_age: maxAge ? Number(maxAge) : null,
        min_rating: minRating ? Number(minRating) : null,
        max_rating: maxRating ? Number(maxRating) : null,
      });
      setName(''); setSex(''); setMinAge(''); setMaxAge(''); setMinRating(''); setMaxRating('');
    } catch (e: any) { setError(e.message); }
  }

  // Reconciliação por modo — grava pairing_mode (+ pairing_split) e ajusta
  // grupos/vínculos. Não gerenciam applying/error próprio: quem chama
  // (saveEmparceiramento) centraliza isso, já que agora há um único botão
  // "Salvar" em vez de cada card aplicar sozinho.
  async function applyAbsolute() {
    let groupId = grps[0]?.id;
    if (!groupId) {
      const g = await createGroup.mutateAsync({ name: 'Único', sort_order: 0 });
      groupId = (g as any)?.id;
    }
    for (const c of cats) {
      if (c.pairing_group_id !== groupId) {
        await updateCategory.mutateAsync({ id: c.id, patch: { pairing_group_id: groupId } });
      }
    }
    await setPairingSplit.mutateAsync(null);
    await setMode.mutateAsync('absolute');
  }

  // Um grupo por FAIXA da dimensão escolhida — não por classificação. Assim
  // "Sub-17" e "Sub-17 Feminino" (mesma faixa de idade) caem no MESMO grupo;
  // as outras dimensões continuam como recorte de premiação dentro dele.
  async function applySplit(dim: 'age' | 'rating') {
    const bands = new Map<string, { label: string; catIds: string[] }>();
    for (const c of cats) {
      const key = bandKey(dim, c);
      if (key === null) continue;
      if (!bands.has(key)) bands.set(key, { label: bandLabel(c), catIds: [] });
      bands.get(key)!.catIds.push(c.id);
    }
    if (bands.size === 0) {
      throw new Error(`Nenhuma classificação usa ${dim === 'age' ? 'idade' : 'rating'} ainda — gere as classificações no bloco abaixo primeiro.`);
    }
    let i = 0;
    for (const [, band] of bands) {
      let groupId = grps.find((g) => g.name === band.label)?.id;
      if (!groupId) {
        const g = await createGroup.mutateAsync({ name: band.label, sort_order: i });
        groupId = (g as any)?.id;
      }
      for (const catId of band.catIds) {
        const cat = cats.find((c) => c.id === catId);
        if (cat && cat.pairing_group_id !== groupId) {
          await updateCategory.mutateAsync({ id: catId, patch: { pairing_group_id: groupId } });
        }
      }
      i++;
    }
    await setPairingSplit.mutateAsync(dim);
    await setMode.mutateAsync('per_category');
  }

  async function applyCustom() {
    await setPairingSplit.mutateAsync(null);
    await setMode.mutateAsync('custom');
  }

  async function saveEmparceiramento() {
    setApplying(true);
    setError('');
    setPairingSaved(false);
    try {
      if (pendingChoice === 'absolute') await applyAbsolute();
      else if (pendingChoice === 'custom') await applyCustom();
      else await applySplit(pendingChoice);
      setPairingSaved(true);
    } catch (e: any) { setError(e.message); }
    finally { setApplying(false); }
  }

  function selectPairing(choice: PairingChoice) {
    setPendingChoice(choice);
    setPairingSaved(false);
  }

  const hasAgeCats = cats.some((c) => c.min_age != null || c.max_age != null);
  const hasRatingCats = cats.some((c) => c.min_rating != null || c.max_rating != null);
  // Faixas customizadas (fora dos presets) viram chip extra — mesmo
  // mecanismo de marcar/desmarcar dos presets, sem campo de nome separado.
  const customAgeBands = ageBands.filter((b) => !AGE_PRESETS.some((p) => p.name === b.name));
  const customRatingBands = ratingBands.filter((b) => !RATING_PRESETS.some((p) => p.name === b.name));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Classificação e Emparceiramento</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Classificação é o ranking de premiação: cada jogador cai numa faixa (ou só no Geral).
          Emparceiramento é quem joga contra quem — pode ser junto ou dividido por idade/rating.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Classificação vem primeiro: emparceiramento "por idade"/"por rating"
          depende de já existir classificação usando aquela dimensão. */}
      <section className="card p-5 space-y-3" data-tour="secao-classificacao">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Classificação</h3>

        <DimensionQuestion
          dataTour="pergunta-idade"
          question="Seu torneio vai ter classificação separada por idade?"
          on={ageOn}
          onToggle={toggleAgeOn}
        >
          <div className="flex flex-wrap gap-1.5">
            {AGE_PRESETS.map((p) => (
              <Chip key={p.name} active={ageBands.some((b) => b.name === p.name)} onClick={() => toggleAgePreset(p)}>
                {p.name}
              </Chip>
            ))}
          </div>
          {customAgeBands.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customAgeBands.map((b) => (
                <Chip key={b.name} active onClick={() => toggleAgePreset(b)}>{b.name}</Chip>
              ))}
            </div>
          )}
          <CustomRangeForm
            label="idade"
            value={customAge}
            onChange={setCustomAge}
            onAdd={addCustomAge}
          />
        </DimensionQuestion>

        <DimensionQuestion
          dataTour="pergunta-rating"
          question="Seu torneio vai ter classificação separada por rating?"
          on={ratingOn}
          onToggle={toggleRatingOn}
        >
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Rating não é pedido na inscrição pública — preencha em Participantes pra cada jogador que precisar.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RATING_PRESETS.map((p) => (
              <Chip key={p.name} active={ratingBands.some((b) => b.name === p.name)} onClick={() => toggleRatingPreset(p)}>
                {p.name}
              </Chip>
            ))}
          </div>
          {customRatingBands.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customRatingBands.map((b) => (
                <Chip key={b.name} active onClick={() => toggleRatingPreset(b)}>{b.name}</Chip>
              ))}
            </div>
          )}
          <CustomRangeForm
            label="rating"
            value={customRating}
            onChange={setCustomRating}
            onAdd={addCustomRating}
          />
        </DimensionQuestion>

        <DimensionQuestion
          dataTour="pergunta-feminina"
          question="Seu torneio vai ter classificação feminina?"
          on={femaleOn}
          onToggle={toggleFemale}
        >
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cruza com idade/rating quando marcados — ex: idade + feminina gera &quot;Sub-17&quot; e &quot;Sub-17 Feminino&quot;,
            não uma &quot;Feminino&quot; avulsa. Só feminina marcada gera &quot;Feminino&quot; sozinha.
          </p>
        </DimensionQuestion>

        {/* Bloco 2 — preview e geração */}
        {previewCells.length > 0 && (
          <div className="card p-4 space-y-3" data-tour="gerar-classificacoes">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Prévia — {previewCells.length} classificaç{previewCells.length !== 1 ? 'ões' : 'ão'}
              </p>
              {missingCells.length > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">{missingCells.length} nova{missingCells.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            {previewCells.length > CLASSIFICATION_COUNT_WARNING_THRESHOLD && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {previewCells.length} classificações é bastante — confira se não cruzou dimensão demais.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {previewCells.map((c) => (
                <span
                  key={c.name}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    existingNames.has(c.name.trim().toLowerCase())
                      ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      : 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                  }`}
                >
                  {c.name}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button loading={applying} onClick={generate}>Salvar classificações</Button>
              {classificationsSaved && !applying && (
                <span className="text-sm text-green-600 dark:text-green-400">✓ Salvo</span>
              )}
            </div>
            {unmatchedCount !== null && unmatchedCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {unmatchedCount} jogador{unmatchedCount !== 1 ? 'es' : ''} sem classificação — falta ano de
                nascimento{ratingOn ? ' ou rating' : ''}. Corrija em Participantes.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
        >
          {showManual ? '– esconder' : '+ adicionar classificação manualmente'}
        </button>

        {showManual && (
          <div className="card p-4 space-y-3">
            <Input label="Nome" placeholder="Ex: Sub-7 Masculino" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Select label="Sexo" value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">—</option>
                <option value="m">Masculino</option>
                <option value="w">Feminino</option>
              </Select>
              <Input label="Idade mín." type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
              <Input label="Idade máx." type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
              <Input label="Rating mín." type="number" value={minRating} onChange={(e) => setMinRating(e.target.value)} />
              <Input label="Rating máx." type="number" value={maxRating} onChange={(e) => setMaxRating(e.target.value)} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Critérios são a regra de derivação (não bloqueiam a inscrição).</p>
            <Button loading={createCategory.isPending} onClick={addCategory}>Adicionar</Button>
          </div>
        )}
      </section>

      {/* Emparceiramento — seleção fica local até "Salvar". */}
      <section className="card p-5 space-y-3" data-tour="secao-emparceiramento">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Emparceiramento</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">O emparceiramento é separado?</p>
        <div className="space-y-2">
          <ModeOption
            active={pendingChoice === 'absolute'} disabled={applying}
            title="Não — todos juntos" desc="Um grupo único. As classificações continuam valendo pra premiação."
            onSelect={() => selectPairing('absolute')}
          />
          <ModeOption
            active={pendingChoice === 'age'} disabled={applying || !hasAgeCats}
            title="Por idade" desc="Um grupo por faixa de idade. As demais classificações viram recorte dentro do grupo."
            onSelect={() => selectPairing('age')}
          />
          <ModeOption
            active={pendingChoice === 'rating'} disabled={applying || !hasRatingCats}
            title="Por rating" desc="Um grupo por faixa de rating."
            onSelect={() => selectPairing('rating')}
          />
          <ModeOption
            active={pendingChoice === 'custom'} disabled={applying}
            title="Personalizado" desc="Você define os grupos e mapeia cada classificação a um grupo."
            onSelect={() => selectPairing('custom')}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button loading={applying} onClick={saveEmparceiramento}>
            Salvar emparceiramento
          </Button>
          {pairingSaved && !applying && (
            <span className="text-sm text-green-600 dark:text-green-400">✓ Salvo</span>
          )}
        </div>
        {/* Reconciliação é idempotente — clicar de novo depois de gerar mais
            classificações na mesma dimensão vincula as novas ao grupo certo. */}

        {pendingChoice === 'custom' && (
          <CustomMapping
            tournamentId={tournamentId}
            defaultRounds={defaultRounds}
            categories={cats}
            groups={grps}
            onError={setError}
          />
        )}
      </section>
    </div>
  );
}

function CustomMapping({
  tournamentId, defaultRounds, categories, groups, onError,
}: {
  tournamentId: string; defaultRounds: number;
  categories: TournamentCategory[]; groups: PairingGroup[]; onError: (m: string) => void;
}) {
  const createGroup = useCreateGroup(tournamentId);
  const updateGroup = useUpdateGroup(tournamentId);
  const deleteGroup = useDeleteGroup(tournamentId);
  const updateCategory = useUpdateCategory(tournamentId);
  const { data: rounds } = useTournamentRounds(tournamentId);
  const [newGroup, setNewGroup] = useState('');
  const [newRounds, setNewRounds] = useState('');

  // useDeleteGroup é um DELETE cru — as FKs são ON DELETE SET NULL, então
  // apagar um grupo com rodada já em andamento/encerrada orfanaria jogadores
  // e rodadas (pairing_group_id = null), quebrando enforce_native_pairing_group
  // na próxima escrita. Recusar aqui em vez de deixar quebrar depois.
  function groupHasLockedRound(groupId: string): boolean {
    return (rounds ?? []).some((r) => r.pairing_group_id === groupId && r.status !== 'draft');
  }

  function handleDeleteGroup(g: PairingGroup) {
    if (groupHasLockedRound(g.id)) {
      onError(`"${g.name}" já tem rodada publicada ou encerrada — não dá pra excluir sem orfanar jogadores/rodadas.`);
      return;
    }
    deleteGroup.mutateAsync(g.id).catch((er) => onError(er.message));
  }

  async function addGroup() {
    if (newGroup.trim().length < 1) { onError('Informe o nome do grupo.'); return; }
    onError('');
    try {
      await createGroup.mutateAsync({ name: newGroup, rounds_count: newRounds ? Number(newRounds) : null, sort_order: groups.length });
      setNewGroup(''); setNewRounds('');
    } catch (e: any) { onError(e.message); }
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Grupos */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Grupos</p>
        {groups.map((g) => (
          <div key={g.id} className="card p-3 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[8rem]">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Nome</label>
              <Input
                defaultValue={g.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== g.name) updateGroup.mutateAsync({ id: g.id, name: v }).catch((er) => onError(er.message));
                }}
              />
            </div>
            <div className="w-20">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Rodadas</label>
              <Input
                type="number" min={1} max={20} placeholder={String(defaultRounds)}
                defaultValue={g.rounds_count ?? ''}
                onBlur={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  if (v !== g.rounds_count) updateGroup.mutateAsync({ id: g.id, rounds_count: v }).catch((er) => onError(er.message));
                }}
              />
            </div>
            <button
              onClick={() => handleDeleteGroup(g)}
              disabled={groupHasLockedRound(g.id)}
              className="mb-1 rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-10 text-sm text-gray-500 hover:text-red-600 disabled:opacity-40 disabled:hover:text-gray-500 dark:text-gray-400"
              aria-label="Excluir grupo"
              title={groupHasLockedRound(g.id) ? 'Tem rodada publicada/encerrada — não dá pra excluir' : undefined}
            >✕</button>
          </div>
        ))}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Novo grupo" placeholder="Ex: Base" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
          </div>
          <div className="w-20">
            <Input label="Rodadas" type="number" min={1} max={20} placeholder="herda" value={newRounds} onChange={(e) => setNewRounds(e.target.value)} />
          </div>
          <Button size="sm" loading={createGroup.isPending} onClick={addGroup}>Adicionar</Button>
        </div>
      </div>

      {/* Mapeamento classificação → grupo */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Classificação → grupo</p>
        {categories.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Crie classificações acima.</p>}
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{c.name}</span>
            <div className="w-48">
              <Select
                value={c.pairing_group_id ?? ''}
                onChange={(e) => updateCategory.mutateAsync({ id: c.id, patch: { pairing_group_id: e.target.value || null } }).catch((er) => onError(er.message))}
              >
                <option value="">— sem grupo —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
