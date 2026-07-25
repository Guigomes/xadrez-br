'use client';

import { use, useMemo, useState } from 'react';
import { useTournament, useTournamentRounds } from '@/lib/hooks/use-tournament';
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
import type { PairingMode, TournamentCategory, PairingGroup, ClassificationDimension } from '@/types/database';

export default function ClassificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p className="text-sm text-gray-500">Torneio não encontrado.</p>;
  if (tournament.mode !== 'native') {
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
      tournamentId={tournament.id}
      defaultRounds={tournament.rounds_count}
      currentMode={tournament.pairing_mode}
      currentSplit={tournament.pairing_split ?? null}
      initialDimensions={tournament.classification_dimensions ?? []}
    />
  );
}

function critSummary(c: TournamentCategory): string {
  const parts: string[] = [];
  if (c.sex) parts.push(c.sex === 'w' ? 'Feminino' : 'Masculino');
  if (c.min_age != null || c.max_age != null) {
    parts.push(`idade ${c.min_age ?? '?'}–${c.max_age ?? '?'}`);
  }
  if (c.min_rating != null || c.max_rating != null) {
    parts.push(`rating ${c.min_rating ?? '?'}–${c.max_rating ?? '?'}`);
  }
  return parts.join(' · ');
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
  const createGroup = useCreateGroup(tournamentId);
  const setMode = useSetPairingMode(tournamentId);
  const setDimensions = useSetClassificationDimensions(tournamentId);
  const setPairingSplit = useSetPairingSplit(tournamentId);
  const bulkCreate = useBulkCreateCategories(tournamentId);
  const refreshCategories = useRefreshCategories(tournamentId);

  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null);

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

  // useMemo precisa vir antes de qualquer return condicional (regra dos hooks) —
  // cats/grps ainda podem ser undefined aqui, generateClassificationCells não
  // depende deles.
  const previewCells = useMemo(
    () => generateClassificationCells({
      ageBands: ageOn ? ageBands : [],
      ratingBands: ratingOn ? ratingBands : [],
      female: femaleOn,
    }),
    [ageOn, ratingOn, femaleOn, ageBands, ratingBands]
  );

  if (loadingCats || loadingGroups) return <PageSpinner />;

  const cats = categories ?? [];
  const grps = groups ?? [];

  const existingNames = new Set(cats.map((c) => c.name.trim().toLowerCase()));
  const previewNames = new Set(previewCells.map((c) => c.name.trim().toLowerCase()));
  const missingCells = previewCells.filter((c) => !existingNames.has(c.name.trim().toLowerCase()));
  const staleCats = cats.filter(
    (c) => previewCells.length > 0 && !previewNames.has(c.name.trim().toLowerCase())
  );

  function toggleAgePreset(preset: AgePreset) {
    setAgeBands((prev) =>
      prev.some((b) => b.name === preset.name) ? prev.filter((b) => b.name !== preset.name) : [...prev, preset]
    );
  }
  function toggleRatingPreset(preset: RatingPreset) {
    setRatingBands((prev) =>
      prev.some((b) => b.name === preset.name) ? prev.filter((b) => b.name !== preset.name) : [...prev, preset]
    );
  }
  function addCustomAge() {
    if (!customAge.name.trim()) { setError('Informe o nome da faixa de idade.'); return; }
    setError('');
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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Classificação e Emparceiramento</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Classificação é o ranking de premiação: cada jogador cai numa faixa (ou só no Geral).
          Emparceiramento é quem joga contra quem — pode ser junto ou dividido por idade/rating.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Emparceiramento — vem primeiro na tela: é a decisão mais visível e
          não depende de scroll pra achar. Seleção fica local até "Salvar". */}
      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Emparceiramento</h2>
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

      {/* Bloco 1 — as 3 perguntas */}
      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Classificação</h2>

        <DimensionQuestion
          question="Seu torneio vai ter classificação separada por idade?"
          on={ageOn}
          onToggle={() => setAgeOn((v) => !v)}
        >
          <div className="flex flex-wrap gap-1.5">
            {AGE_PRESETS.map((p) => (
              <Chip key={p.name} active={ageBands.some((b) => b.name === p.name)} onClick={() => toggleAgePreset(p)}>
                {p.name}
              </Chip>
            ))}
          </div>
          <CustomRangeForm
            label="idade"
            value={customAge}
            onChange={setCustomAge}
            onAdd={addCustomAge}
          />
        </DimensionQuestion>

        <DimensionQuestion
          question="Seu torneio vai ter classificação separada por rating?"
          on={ratingOn}
          onToggle={() => setRatingOn((v) => !v)}
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
          <CustomRangeForm
            label="rating"
            value={customRating}
            onChange={setCustomRating}
            onAdd={addCustomRating}
          />
        </DimensionQuestion>

        <DimensionQuestion
          question="Seu torneio vai ter classificação feminina?"
          on={femaleOn}
          onToggle={() => setFemaleOn((v) => !v)}
        >
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cruza com idade/rating quando marcados — ex: idade + feminina gera &quot;Sub-17&quot; e &quot;Sub-17 Feminino&quot;,
            não uma &quot;Feminino&quot; avulsa. Só feminina marcada gera &quot;Feminino&quot; sozinha.
          </p>
        </DimensionQuestion>

        {/* Bloco 2 — preview e geração */}
        {previewCells.length > 0 && (
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Preview — {previewCells.length} classificaç{previewCells.length !== 1 ? 'ões' : 'ão'}
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
            <Button loading={applying} onClick={generate}>Gerar classificações</Button>
            {unmatchedCount !== null && unmatchedCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {unmatchedCount} jogador{unmatchedCount !== 1 ? 'es' : ''} sem classificação — falta ano de
                nascimento{ratingOn ? ' ou rating' : ''}. Corrija em Participantes.
              </p>
            )}
          </div>
        )}

        {/* Classificações existentes */}
        {cats.length > 0 && (
          <div className="space-y-2">
            {cats.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                tournamentId={tournamentId}
                stale={staleCats.some((s) => s.id === c.id)}
                onError={setError}
              />
            ))}
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
    </div>
  );
}

function DimensionQuestion({
  question, on, onToggle, children,
}: {
  question: string; on: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{question}</p>
        <div className="flex gap-1.5 shrink-0">
          <Chip active={on} onClick={onToggle}>Sim</Chip>
          <Chip active={!on} onClick={onToggle}>Não</Chip>
        </div>
      </div>
      {on && children && <div className="space-y-2 pt-1">{children}</div>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function CustomRangeForm({
  label, value, onChange, onAdd,
}: {
  label: string;
  value: { name: string; min: string; max: string };
  onChange: (v: { name: string; min: string; max: string }) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 pt-1">
      <div className="flex-1 min-w-[8rem]">
        <Input
          label={`Faixa custom de ${label}`}
          placeholder="Nome"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>
      <div className="w-20">
        <Input label="Mín." type="number" value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })} />
      </div>
      <div className="w-20">
        <Input label="Máx." type="number" value={value.max} onChange={(e) => onChange({ ...value, max: e.target.value })} />
      </div>
      <Button size="sm" variant="secondary" onClick={onAdd}>Add</Button>
    </div>
  );
}

function ModeOption({
  active, disabled, title, desc, onSelect,
}: {
  active: boolean; disabled?: boolean; title: string; desc: string; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors disabled:opacity-40 ${
        active
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-4 w-4 rounded-full border-2 ${active ? 'border-brand-500 bg-brand-500' : 'border-gray-300 dark:border-gray-600'}`} />
        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{title}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">{desc}</p>
    </button>
  );
}

function CategoryRow({
  category, tournamentId, stale, onError,
}: {
  category: TournamentCategory; tournamentId: string; stale: boolean; onError: (m: string) => void;
}) {
  const updateCategory = useUpdateCategory(tournamentId);
  const deleteCategory = useDeleteCategory(tournamentId);
  const [name, setName] = useState(category.name);
  const [confirmDel, setConfirmDel] = useState(false);
  const summary = critSummary(category);

  return (
    <div className="card p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[10rem]">
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name.trim() !== category.name) {
                updateCategory.mutateAsync({ id: category.id, patch: { name } }).catch((e) => onError(e.message));
              }
            }}
          />
          {stale && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              fora do padrão atual
            </span>
          )}
        </div>
        {summary && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{summary}</p>}
      </div>
      {confirmDel ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" loading={deleteCategory.isPending}
            onClick={() => deleteCategory.mutateAsync(category.id).catch((e) => { onError(e.message); setConfirmDel(false); })}>
            Confirmar
          </Button>
          <button onClick={() => setConfirmDel(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">Cancelar</button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDel(true)}
          className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          Excluir
        </button>
      )}
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
          <Button size="sm" loading={createGroup.isPending} onClick={addGroup}>Add</Button>
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
