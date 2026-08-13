'use client';

import { use, useState } from 'react';
import { useTournament, useTournamentPlayers, useAddTournamentPlayer, useAssignPlayerGroup, useSetPlayerCategory } from '@/lib/hooks/use-tournament';
import { useCreatePlayer, useUpdatePlayer, useSyncCbxRating } from '@/lib/hooks/use-player';
import { useGroups, useCreateDefaultGroup } from '@/lib/hooks/use-native-rounds';
import { useCategories } from '@/lib/hooks/use-classifications';
import { deriveCategory, type CategoryCandidate } from '@/lib/utils/classification-match';
import { PageSpinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { formatScore, BR_STATES, compareGroupNames } from '@/lib/utils/chess';
import type { PlayerFormValues, PairingGroup, TournamentCategory } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

/** Jogador em edição no modal, ou null quando o modal está fechado/em modo de cadastro. */
interface EditingPlayer {
  tpId: string;
  playerId: string;
  categoryId: string;
  values: Partial<PlayerFormValues>;
}

export default function AdminPlayersPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);
  const { data: tPlayers, isLoading: loadingPlayers } = useTournamentPlayers(tournament?.id ?? '');
  const assignGroup = useAssignPlayerGroup(tournament?.id ?? '');
  const { data: categories } = useCategories(tournament?.id ?? '');
  const isNative = tournament?.mode === 'native';
  const { data: groups, isLoading: loadingGroups } = useGroups(isNative ? tournament!.id : '');
  const createGroup = useCreateDefaultGroup(tournament?.id ?? '');

  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [error, setError] = useState('');

  // Modal de cadastro/edição — null = fechado. editing !== null = modo edição
  // (aberto a partir de "✏️ Editar" numa linha); showCreateModal cobre o
  // cadastro novo, os dois nunca ficam abertos ao mesmo tempo.
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editing, setEditing] = useState<EditingPlayer | null>(null);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  function startEdit(tpId: string, categoryId: string | null, player: any) {
    setEditing({
      tpId,
      playerId: player.id,
      categoryId: categoryId ?? '',
      values: {
        full_name: player.full_name,
        birth_year: player.birth_year ?? undefined,
        sex: player.sex ?? undefined,
        state: player.state ?? undefined,
        cbx_id: player.cbx_id ?? undefined,
        fide_id: player.fide_id ?? undefined,
        federation: player.federation ?? undefined,
      },
    });
  }

  async function handleAssignGroup(tpId: string, gId: string) {
    setError('');
    try {
      await assignGroup.mutateAsync({ tpId, groupId: gId });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleImportUrl() {
    if (!importUrl.trim() || !tournament) return;
    setError('');
    setImportReport('');
    setImporting(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/import-players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao importar.');
      setImportReport(
        `Importação concluída: ${data.added} adicionados, ${data.created} novos cadastros, ${data.reused} já existentes, ${data.skipped} ignorados, ${data.failed} falhas.`
      );
      setImportUrl('');
    } catch (err: any) {
      setError(err.message ?? 'Erro ao importar.');
    } finally {
      setImporting(false);
    }
  }

  // Classificação (célula da partição) é derivada de birth_year/rating_std/sex.
  // Cadastro manual já deriva ao adicionar — mas import por URL não passa por
  // esse fluxo e chess-results não traz esses campos, então continua sem
  // classificação até alguém corrigir aqui. Melhor avisar do que fingir que
  // já classificou.
  const classificationDims = tournament.classification_dimensions ?? [];
  const hasClassifications = classificationDims.length > 0;
  function missingClassificationFields(player: any): string[] {
    const missing: string[] = [];
    if (classificationDims.includes('age') && player?.birth_year == null) missing.push('ano de nascimento');
    if (classificationDims.includes('rating') && player?.rating_std == null) missing.push('rating');
    if (classificationDims.includes('sex') && player?.sex == null) missing.push('sexo');
    return missing;
  }
  const unclassified = hasClassifications
    ? (tPlayers ?? []).filter((tp) => !(tp as any).category)
    : [];

  // Índice global estável pra numeração de fallback (initial_ranking ausente)
  // não reiniciar dentro de cada grupo.
  const indexOf = new Map<string, number>();
  (tPlayers ?? []).forEach((tp, i) => indexOf.set(tp.id, i));

  // Participantes divididos por grupo de emparceiramento (mesmo padrão da
  // página pública). Sem grupo nenhum (importado ou nativo não configurado),
  // cai na lista chapada.
  const sortedGroups = [...(groups ?? [])].sort((a, b) => compareGroupNames(a.name, b.name));
  const groupSections = isNative && sortedGroups.length > 0
    ? [
        ...sortedGroups.map((g) => ({
          key: g.id,
          title: g.name,
          rows: (tPlayers ?? []).filter((tp) => (tp as any).pairing_group_id === g.id),
        })),
        {
          key: '__none__',
          title: 'Sem grupo',
          rows: (tPlayers ?? []).filter((tp) => !(tp as any).pairing_group_id),
        },
      ].filter((s) => s.key !== '__none__' || s.rows.length > 0)
    : [];
  // Uma seção só = o cabeçalho dela ("Absoluto (N)", o grupo que todo torneio
  // nativo ganha na criação) apenas repete o "Participantes (N)" logo acima.
  // A partir de duas seções o agrupamento passa a informar algo.
  const useGroupSections = groupSections.length > 1;

  function renderRow(tp: any, i: number) {
    const tpAny = tp as any;
    const missingGroup = isNative && !tpAny.pairing_group_id && (groups?.length ?? 0) > 0;
    const missingFields = hasClassifications && !tpAny.category ? missingClassificationFields(tpAny.player) : [];
    return (
      <div key={tp.id} className="flex items-center gap-3 px-4 py-3">
        <span className="text-xs text-gray-400 w-5 text-center">{tp.initial_ranking ?? i + 1}</span>
        <div className="flex-1 min-w-0">
          {/* line-clamp-2 em vez de truncate: nome comprido de participante
              cortado com "..." na primeira palavra é ilegível — deixar quebrar
              em até duas linhas mostra o nome inteiro nos casos reais. */}
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
            {tpAny.player?.full_name}
          </p>
          <p className="text-xs text-gray-400">
            {tpAny.player?.city ?? tpAny.player?.state ?? ''}
            {tpAny.player?.rating_std ? ` · ${tpAny.player.rating_std}` : ''}
            {tpAny.player?.cbx_id ? ` · CBX ${tpAny.player.cbx_id}` : ''}
            {tpAny.player?.fide_id ? ` · FIDE ${tpAny.player.fide_id}` : ''}
          </p>
          {missingGroup && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-amber-600 dark:text-amber-400">⚠ sem grupo — não será pareado</span>
              <select
                className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-1.5 py-0.5 text-xs"
                defaultValue=""
                disabled={assignGroup.isPending}
                onChange={(e) => e.target.value && handleAssignGroup(tp.id, e.target.value)}
              >
                <option value="" disabled>Atribuir grupo…</option>
                {groups!.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {missingFields.length > 0 && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              ⚠ sem classificação — falta {missingFields.join(', ')}
            </p>
          )}
        </div>
        <span className="text-sm font-semibold text-brand-600 dark:text-brand-400 tabular-nums shrink-0">
          {formatScore(tp.current_score)}
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => startEdit(tp.id, tpAny.category_id ?? tpAny.category?.id ?? null, tpAny.player)}
          className="shrink-0"
        >
          ✏️ Editar
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {importReport && (
        <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          {importReport}
        </p>
      )}

      {!isNative && (
        /* Import by URL (chess-results) — só para torneios importados */
        <div className="card p-4 mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Importar participantes por link</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Cole o link de download do Chess-Results (padrão de ranking inicial). Os jogadores serão cadastrados e vinculados ao torneio.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="https://chess-results.com/..."
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              disabled={importing}
              onKeyDown={(e) => e.key === 'Enter' && handleImportUrl()}
            />
            <Button onClick={handleImportUrl} loading={importing} disabled={!importUrl.trim()}>
              Importar
            </Button>
          </div>
        </div>
      )}

      {/* Native tournament sem nenhum grupo ainda — precisa existir pelo menos
          um antes de adicionar gente (DB recusa tournament_players sem
          pairing_group_id em torneio nativo). Configure em Classificação e
          Emparceiramento; este atalho só cobre quem pulou essa etapa. */}
      {isNative && !groups?.length && (
        <div className="card p-4 mb-4 flex items-center gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum grupo de emparceiramento ainda.</p>
          <Button size="sm" variant="secondary" loading={createGroup.isPending}
            onClick={() => createGroup.mutate('Absoluto')}>
            Criar grupo &quot;Absoluto&quot;
          </Button>
        </div>
      )}

      {/* A maioria dos participantes chega por inscrição pública — o cadastro
          manual é a exceção, não o caminho principal. Fica atrás de um botão
          em vez de um formulário sempre aberto competindo por atenção. */}
      <div className="mb-4" data-tour="cadastrar-participante">
        <Button
          type="button"
          disabled={isNative && (loadingGroups || !groups?.length)}
          onClick={() => setShowCreateModal(true)}
        >
          + Cadastrar participante
        </Button>
      </div>

      {unclassified.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          ⚠ {unclassified.length} jogador{unclassified.length !== 1 ? 'es' : ''} sem classificação —
          falta ano de nascimento{classificationDims.includes('rating') ? ', rating' : ''}
          {classificationDims.includes('sex') ? ' ou sexo' : ''}. Corrija na lista abaixo.
        </p>
      )}

      {/* Player list */}
      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            Participantes ({tPlayers?.length ?? 0})
          </p>
        </div>
        {loadingPlayers ? (
          <div className="py-8 flex justify-center"><PageSpinner /></div>
        ) : !useGroupSections ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {(tPlayers ?? []).map((tp, i) => renderRow(tp, i))}
          </div>
        ) : (
          <div>
            {groupSections.map((section) => (
              <div key={section.key}>
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800/60">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {section.title} ({section.rows.length})
                  </p>
                </div>
                {section.rows.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">Nenhum participante neste grupo.</p>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                    {section.rows.map((tp) => renderRow(tp, indexOf.get(tp.id)!))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <PlayerFormModal
          tournamentId={tournament.id}
          isNative={isNative}
          groups={groups}
          categories={categories}
          hasClassifications={hasClassifications}
          tournamentStartYear={tournament.start_date ? new Date(tournament.start_date).getFullYear() : null}
          editing={null}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {editing && (
        <PlayerFormModal
          tournamentId={tournament.id}
          isNative={isNative}
          groups={groups}
          categories={categories}
          hasClassifications={hasClassifications}
          tournamentStartYear={tournament.start_date ? new Date(tournament.start_date).getFullYear() : null}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Modal de cadastro/edição de participante — mesmo formulário nos dois casos.
 * `editing` null = cadastra jogador novo e já adiciona ao torneio;
 * `editing` preenchido = atualiza os dados do jogador (e a classificação,
 * se foi trocada) sem mexer no vínculo com o torneio.
 */
function PlayerFormModal({
  tournamentId, isNative, groups, categories, hasClassifications, tournamentStartYear, editing, onClose,
}: {
  tournamentId: string;
  isNative: boolean;
  groups: PairingGroup[] | undefined;
  categories: TournamentCategory[] | undefined;
  hasClassifications: boolean;
  tournamentStartYear: number | null;
  editing: EditingPlayer | null;
  onClose: () => void;
}) {
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer(tournamentId);
  const addPlayer = useAddTournamentPlayer(tournamentId);
  const setCategory = useSetPlayerCategory(tournamentId);
  const syncCbxRating = useSyncCbxRating(tournamentId);

  const [values, setValues] = useState<Partial<PlayerFormValues>>(editing?.values ?? { federation: 'BRA' });
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  // Só o cadastro novo sugere classificação sozinho ao digitar idade/sexo —
  // na edição o jogador já tem (ou não) uma classificação salva, e trocar
  // idade não deveria mudar a seleção sem o organizador pedir.
  const [categoryTouched, setCategoryTouched] = useState(!!editing);
  const [error, setError] = useState('');

  const categoryCandidates: CategoryCandidate[] = (categories ?? []).map((c) => ({
    id: c.id, sortOrder: c.sort_order, sex: c.sex,
    minAge: c.min_age, maxAge: c.max_age, minRating: c.min_rating, maxRating: c.max_rating,
  }));
  function deriveCategoryId(player: { sex: string | null; birth_year: number | null; rating_std: number | null }): string | undefined {
    if (categoryCandidates.length === 0) return undefined;
    const derived = deriveCategory(
      categoryCandidates,
      { sex: player.sex as 'm' | 'w' | null, birthYear: player.birth_year, ratingStd: player.rating_std },
      tournamentStartYear
    );
    return derived?.id;
  }

  // O que o organizador escolhe pro participante é a classificação (idade/rating/
  // sexo, derivada automaticamente) — o grupo de emparceiramento é consequência
  // dela, não uma segunda escolha manual. Cada categoria já carrega seu
  // pairing_group_id (definido em Classificação e Emparceiramento); só cai no
  // fallback "grupo único" quando não há classificação pra derivar daí.
  function resolveGroupId(categoryId: string | undefined): string | undefined {
    if (categoryId) {
      const cat = categories?.find((c) => c.id === categoryId);
      if (cat?.pairing_group_id) return cat.pairing_group_id;
    }
    return groups?.length === 1 ? groups[0].id : undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await updatePlayer.mutateAsync({ id: editing.playerId, patch: values });
        if (categoryId !== editing.categoryId) {
          await setCategory.mutateAsync({ tpId: editing.tpId, categoryId: categoryId || null });
        }
        // Consulta automática do rating CBX — pedido do usuário: tira o botão
        // manual da lista, a consulta acontece sozinha aqui e na aprovação de
        // inscrição (use-registrations.ts). Melhor esforço: não bloqueia o
        // fechamento do modal nem vira erro visível se a CBX falhar.
        if (values.cbx_id?.trim()) syncCbxRating.mutate(editing.playerId);
      } else {
        const p = await createPlayer.mutateAsync(values as PlayerFormValues);
        // categoryId reflete a sugestão automática (idade/sexo) ou a escolha
        // manual do organizador, se ele mudou o select — deriveCategoryId(p) só
        // entra como último recurso (ex.: o jogador já existia com dados que o
        // form não mostrou, então nada aqui foi tocado).
        const finalCategoryId = categoryId || deriveCategoryId(p);
        await addPlayer.mutateAsync({
          player_id: p.id,
          pairing_group_id: resolveGroupId(finalCategoryId),
          category_id: finalCategoryId,
        });
        if (p.cbx_id) syncCbxRating.mutate(p.id);
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const saving = createPlayer.isPending || addPlayer.isPending || updatePlayer.isPending || setCategory.isPending;

  return (
    <Modal title={editing ? 'Editar participante' : 'Cadastrar participante'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        <Input
          label="Nome completo *" required value={values.full_name ?? ''}
          onChange={(e) => setValues((v) => ({ ...v, full_name: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Ano de nascimento" type="number" value={values.birth_year ?? ''}
            onChange={(e) => {
              const birth_year = parseInt(e.target.value) || undefined;
              setValues((v) => ({ ...v, birth_year }));
              if (!categoryTouched) {
                setCategoryId(deriveCategoryId({ sex: values.sex ?? null, birth_year: birth_year ?? null, rating_std: null }) ?? '');
              }
            }}
          />
          <Select
            label="Sexo" value={values.sex ?? ''}
            onChange={(e) => {
              const sex = (e.target.value || undefined) as PlayerFormValues['sex'];
              setValues((v) => ({ ...v, sex }));
              if (!categoryTouched) {
                setCategoryId(deriveCategoryId({ sex: sex ?? null, birth_year: values.birth_year ?? null, rating_std: null }) ?? '');
              }
            }}
          >
            <option value="">Prefiro não informar</option>
            <option value="m">Masculino</option>
            <option value="w">Feminino</option>
          </Select>
        </div>
        {hasClassifications && (categories?.length ?? 0) > 0 && (
          <div>
            <Select
              label="Classificação"
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setCategoryTouched(true); }}
            >
              <option value="">Absoluto (sem faixa)</option>
              {categories!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {!editing && <p className="mt-1 text-xs text-gray-400">Sugerida pela idade/sexo — troque se quiser.</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Select label="UF" value={values.state ?? ''} onChange={(e) => setValues((v) => ({ ...v, state: e.target.value || undefined }))}>
            <option value="">Selecione…</option>
            {BR_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>)}
          </Select>
          <Input
            label="ID CBX" value={values.cbx_id ?? ''}
            hint="Rating vem da CBX depois — sem precisar digitar."
            onChange={(e) => setValues((v) => ({ ...v, cbx_id: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="ID FIDE" value={values.fide_id ?? ''} onChange={(e) => setValues((v) => ({ ...v, fide_id: e.target.value }))} />
          <Input
            label="Federação" maxLength={3} value={values.federation ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, federation: e.target.value.toUpperCase() }))}
            hint="Sigla de 3 letras. Padrão: BRA"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={saving} disabled={isNative && !editing && !groups?.length}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Modal>
  );
}
