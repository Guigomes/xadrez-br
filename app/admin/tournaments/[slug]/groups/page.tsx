'use client';

import { use, useState } from 'react';
import { useTournament } from '@/lib/hooks/use-tournament';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup } from '@/lib/hooks/use-native-rounds';
import {
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, useSetPairingMode,
} from '@/lib/hooks/use-classifications';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { PairingMode, TournamentCategory, PairingGroup } from '@/types/database';

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

function Setup({
  tournamentId, defaultRounds, currentMode,
}: {
  tournamentId: string; defaultRounds: number; currentMode: PairingMode;
}) {
  const { data: categories, isLoading: loadingCats } = useCategories(tournamentId);
  const { data: groups, isLoading: loadingGroups } = useGroups(tournamentId);
  const createCategory = useCreateCategory(tournamentId);
  const updateCategory = useUpdateCategory(tournamentId);
  const deleteCategory = useDeleteCategory(tournamentId);
  const createGroup = useCreateGroup(tournamentId);
  const setMode = useSetPairingMode(tournamentId);

  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [name, setName] = useState('');
  const [sex, setSex] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [minRating, setMinRating] = useState('');
  const [maxRating, setMaxRating] = useState('');

  if (loadingCats || loadingGroups) return <PageSpinner />;

  const cats = categories ?? [];
  const grps = groups ?? [];

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

  // Reconciliação por modo — grava pairing_mode + ajusta grupos/vínculos.
  async function applyMode(mode: PairingMode) {
    setApplying(true);
    setError('');
    try {
      if (mode === 'absolute') {
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
      } else if (mode === 'per_category') {
        for (let i = 0; i < cats.length; i++) {
          const c = cats[i];
          if (c.pairing_group_id) continue; // já mapeado
          const g = await createGroup.mutateAsync({ name: c.name, sort_order: i });
          await updateCategory.mutateAsync({ id: c.id, patch: { pairing_group_id: (g as any)?.id } });
        }
      }
      // custom: não reconcilia — o organizador mapeia à mão abaixo.
      await setMode.mutateAsync(mode);
    } catch (e: any) { setError(e.message); }
    finally { setApplying(false); }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Classificações & Emparceiramento</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Classificação é o que o inscrito escolhe (ex: Sub-7 Masc, U1400). O emparceiramento define
          quem joga contra quem — pode ser absoluto, igual à classificação, ou personalizado.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Classificações */}
      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Classificações</h2>
        {cats.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhuma classificação. Sem classificações, o torneio é absoluto (todos juntos).
          </p>
        ) : (
          <div className="space-y-2">
            {cats.map((c) => (
              <CategoryRow key={c.id} category={c} tournamentId={tournamentId} onError={setError} />
            ))}
          </div>
        )}

        <div className="card p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Adicionar classificação</p>
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
          <p className="text-xs text-gray-500 dark:text-gray-400">Critérios são informativos (não bloqueiam a inscrição).</p>
          <Button loading={createCategory.isPending} onClick={addCategory}>Adicionar</Button>
        </div>
      </section>

      {/* Emparceiramento */}
      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Emparceiramento</h2>
        <div className="space-y-2">
          <ModeOption
            active={currentMode === 'absolute'} disabled={applying}
            title="Absoluto" desc="Todos jogam no mesmo grupo, independente da classificação."
            onSelect={() => applyMode('absolute')}
          />
          <ModeOption
            active={currentMode === 'per_category'} disabled={applying || cats.length === 0}
            title="Igual à classificação" desc="Cada classificação vira um grupo próprio (pareia separado)."
            onSelect={() => applyMode('per_category')}
          />
          <ModeOption
            active={currentMode === 'custom'} disabled={applying || cats.length === 0}
            title="Personalizado" desc="Você define os grupos e mapeia cada classificação a um grupo."
            onSelect={() => applyMode('custom')}
          />
        </div>

        {currentMode === 'custom' && (
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
  category, tournamentId, onError,
}: {
  category: TournamentCategory; tournamentId: string; onError: (m: string) => void;
}) {
  const updateCategory = useUpdateCategory(tournamentId);
  const deleteCategory = useDeleteCategory(tournamentId);
  const [name, setName] = useState(category.name);
  const [confirmDel, setConfirmDel] = useState(false);
  const summary = critSummary(category);

  return (
    <div className="card p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[10rem]">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== category.name) {
              updateCategory.mutateAsync({ id: category.id, patch: { name } }).catch((e) => onError(e.message));
            }
          }}
        />
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
  const [newGroup, setNewGroup] = useState('');
  const [newRounds, setNewRounds] = useState('');

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
              onClick={() => deleteGroup.mutateAsync(g.id).catch((er) => onError(er.message))}
              className="mb-1 rounded-lg border border-gray-200 dark:border-gray-700 px-3 h-10 text-sm text-gray-500 hover:text-red-600 dark:text-gray-400"
              aria-label="Excluir grupo"
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
