'use client';

import { use, useState } from 'react';
import { useTournament, useTournamentPlayers, useAddTournamentPlayer, useAssignPlayerGroup, useSetPlayerCategory } from '@/lib/hooks/use-tournament';
import { useCreatePlayer, useUpdatePlayer, useSyncCbxRating, type CbxRatingResult } from '@/lib/hooks/use-player';
import { useGroups, useCreateDefaultGroup } from '@/lib/hooks/use-native-rounds';
import { useCategories } from '@/lib/hooks/use-classifications';
import { deriveCategory, type CategoryCandidate } from '@/lib/utils/classification-match';
import { PageSpinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { formatScore, BR_STATES } from '@/lib/utils/chess';
import type { PlayerFormValues } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

export default function AdminPlayersPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);
  const { data: tPlayers, isLoading: loadingPlayers } = useTournamentPlayers(tournament?.id ?? '');
  const addPlayer = useAddTournamentPlayer(tournament?.id ?? '');
  const assignGroup = useAssignPlayerGroup(tournament?.id ?? '');
  const setCategory = useSetPlayerCategory(tournament?.id ?? '');
  const { data: categories } = useCategories(tournament?.id ?? '');
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer(tournament?.id ?? '');
  const isNative = tournament?.mode === 'native';
  const { data: groups, isLoading: loadingGroups } = useGroups(isNative ? tournament!.id : '');
  const createGroup = useCreateDefaultGroup(tournament?.id ?? '');

  const [newPlayer, setNewPlayer] = useState<Partial<PlayerFormValues>>({ federation: 'BRA' });
  const [categoryId, setCategoryId] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<PlayerFormValues>>({});
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

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

  // Mesma derivação usada na inscrição pública (registration-form.tsx) — sem
  // isso, jogador cadastrado/adicionado por aqui nascia sem category_id e
  // ficava de fora da classificação até alguém corrigir manualmente na lista.
  const categoryCandidates: CategoryCandidate[] = (categories ?? []).map((c) => ({
    id: c.id, sortOrder: c.sort_order, sex: c.sex,
    minAge: c.min_age, maxAge: c.max_age, minRating: c.min_rating, maxRating: c.max_rating,
  }));
  const tournamentStartYear = tournament.start_date ? new Date(tournament.start_date).getFullYear() : null;
  function deriveCategoryId(player: { sex: string | null; birth_year: number | null; rating_std: number | null }): string | undefined {
    if (categoryCandidates.length === 0) return undefined;
    const derived = deriveCategory(
      categoryCandidates,
      { sex: player.sex as 'm' | 'w' | null, birthYear: player.birth_year, ratingStd: player.rating_std },
      tournamentStartYear
    );
    return derived?.id;
  }

  async function handleCreateAndAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const p = await createPlayer.mutateAsync(newPlayer as PlayerFormValues);
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
      setNewPlayer({ federation: 'BRA' });
      setCategoryId('');
      setCategoryTouched(false);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function startEdit(tpId: string, player: any) {
    setEditingId(tpId);
    setEditValues({
      full_name: player.full_name,
      birth_year: player.birth_year ?? undefined,
      sex: player.sex ?? undefined,
      state: player.state ?? undefined,
      cbx_id: player.cbx_id ?? undefined,
      fide_id: player.fide_id ?? undefined,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function handleSaveEdit(playerId: string) {
    setError('');
    try {
      await updatePlayer.mutateAsync({ id: playerId, patch: editValues });
      cancelEdit();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleAssignGroup(tpId: string, gId: string) {
    setError('');
    try {
      await assignGroup.mutateAsync({ tpId, groupId: gId });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSetCategory(tpId: string, categoryId: string) {
    setError('');
    try {
      await setCategory.mutateAsync({ tpId, categoryId: categoryId || null });
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
  // Cadastro manual já deriva ao adicionar (ver deriveCategoryId acima) — mas
  // import por URL não passa por esse fluxo e chess-results não traz esses
  // campos, então continua sem classificação até alguém corrigir aqui.
  // Melhor avisar do que fingir que já classificou.
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
  return (
    <div className="max-w-2xl">
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
            onClick={() => createGroup.mutate('Único')}>
            Criar grupo &quot;Único&quot;
          </Button>
        </div>
      )}

      {/* Cadastrar participante — sem distinção entre "buscar existente" e
          "cadastrar novo": o ID CBX é a chave. Se já existir um jogador com
          esse ID, useCreatePlayer reaproveita o registro em vez de duplicar. */}
      <form onSubmit={handleCreateAndAdd} className="card p-4 mb-4 space-y-3" data-tour="cadastrar-participante">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Cadastrar participante</h2>
        <Input label="Nome completo *" required value={newPlayer.full_name ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, full_name: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Ano de nascimento" type="number" value={newPlayer.birth_year ?? ''}
            onChange={(e) => {
              const birth_year = parseInt(e.target.value) || undefined;
              setNewPlayer((p) => ({ ...p, birth_year }));
              if (!categoryTouched) {
                setCategoryId(deriveCategoryId({ sex: newPlayer.sex ?? null, birth_year: birth_year ?? null, rating_std: null }) ?? '');
              }
            }}
          />
          <Select
            label="Sexo" value={newPlayer.sex ?? ''}
            onChange={(e) => {
              const sex = (e.target.value || undefined) as PlayerFormValues['sex'];
              setNewPlayer((p) => ({ ...p, sex }));
              if (!categoryTouched) {
                setCategoryId(deriveCategoryId({ sex: sex ?? null, birth_year: newPlayer.birth_year ?? null, rating_std: null }) ?? '');
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
              <option value="">Geral (sem classificação)</option>
              {categories!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <p className="mt-1 text-xs text-gray-400">Sugerida pela idade/sexo — troque se quiser.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Select label="UF" value={newPlayer.state ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, state: e.target.value || undefined }))}>
            <option value="">Selecione…</option>
            {BR_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>)}
          </Select>
          <Input
            label="ID CBX" value={newPlayer.cbx_id ?? ''}
            hint="Rating vem da CBX depois — sem precisar digitar."
            onChange={(e) => setNewPlayer((p) => ({ ...p, cbx_id: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="ID FIDE" value={newPlayer.fide_id ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, fide_id: e.target.value }))} />
          <Input
            label="Federação" maxLength={3} value={newPlayer.federation ?? ''}
            onChange={(e) => setNewPlayer((p) => ({ ...p, federation: e.target.value.toUpperCase() }))}
            hint="Sigla de 3 letras. Padrão: BRA"
          />
        </div>
        <Button
          type="submit"
          loading={createPlayer.isPending || addPlayer.isPending}
          disabled={isNative && loadingGroups}
        >
          Adicionar
        </Button>
      </form>

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
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {tPlayers?.map((tp, i) => {
              const tpAny = tp as any;
              const missingGroup = isNative && !tpAny.pairing_group_id && (groups?.length ?? 0) > 0;
              const missingFields = hasClassifications && !tpAny.category ? missingClassificationFields(tpAny.player) : [];
              return (
                <div key={tp.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs text-gray-400 w-5 text-center">{tp.initial_ranking ?? i + 1}</span>
                  <div className="flex-1 min-w-0">
                    {editingId === tp.id ? (
                      <div className="space-y-2 py-1">
                        <input
                          className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-sm"
                          placeholder="Nome completo"
                          value={editValues.full_name ?? ''}
                          onChange={(e) => setEditValues((v) => ({ ...v, full_name: e.target.value }))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
                            type="number" placeholder="Ano de nascimento"
                            value={editValues.birth_year ?? ''}
                            onChange={(e) => setEditValues((v) => ({ ...v, birth_year: parseInt(e.target.value) || undefined }))}
                          />
                          <select
                            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
                            value={editValues.sex ?? ''}
                            onChange={(e) => setEditValues((v) => ({ ...v, sex: (e.target.value || undefined) as PlayerFormValues['sex'] }))}
                          >
                            <option value="">Prefiro não informar</option>
                            <option value="m">Masculino</option>
                            <option value="w">Feminino</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
                            placeholder="Estado"
                            value={editValues.state ?? ''}
                            onChange={(e) => setEditValues((v) => ({ ...v, state: e.target.value }))}
                          />
                          <input
                            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
                            placeholder="ID CBX"
                            value={editValues.cbx_id ?? ''}
                            onChange={(e) => setEditValues((v) => ({ ...v, cbx_id: e.target.value }))}
                          />
                        </div>
                        <input
                          className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
                          placeholder="ID FIDE"
                          value={editValues.fide_id ?? ''}
                          onChange={(e) => setEditValues((v) => ({ ...v, fide_id: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" loading={updatePlayer.isPending} onClick={() => handleSaveEdit(tpAny.player.id)}>
                            Salvar
                          </Button>
                          <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {tpAny.player?.full_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {tpAny.player?.city ?? tpAny.player?.state ?? ''}
                          {tpAny.player?.rating_std ? ` · ${tpAny.player.rating_std}` : ''}
                          {tpAny.player?.cbx_id ? ` · CBX ${tpAny.player.cbx_id}` : ''}
                          {tpAny.player?.fide_id ? ` · FIDE ${tpAny.player.fide_id}` : ''}
                        </p>
                        {tpAny.player?.cbx_id && tournament && (
                          <CbxRatingButton
                            tournamentId={tournament.id}
                            playerId={tpAny.player.id}
                            declaredName={tpAny.player.full_name}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(tp.id, tpAny.player)}
                          className="mt-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          ✏️ Editar
                        </button>
                      </>
                    )}
                    {hasClassifications && (categories?.length ?? 0) > 0 && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-gray-400">🏷️</span>
                        <select
                          className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-1.5 py-0.5 text-xs"
                          value={tpAny.category_id ?? tpAny.category?.id ?? ''}
                          disabled={setCategory.isPending}
                          onChange={(e) => handleSetCategory(tp.id, e.target.value)}
                        >
                          <option value="">Geral (sem classificação)</option>
                          {categories!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}
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
                  <span className="text-sm font-semibold text-brand-600 dark:text-brand-400 tabular-nums">
                    {formatScore(tp.current_score)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Consulta o rating oficial na CBX pelo ID cadastrado. A rota faz o cache de
 * 30 dias — clicar de novo no mesmo mês não bate na CBX de novo, só devolve
 * o que já está salvo (fromCache: true).
 *
 * Mostra o nome que voltou da CBX ao lado do cadastrado: o ID CBX é digitado
 * à mão, e um dígito trocado aponta pra outra pessoa sem erro nenhum — não
 * dá pra confiar cegamente no rating só porque a consulta "funcionou".
 */
function CbxRatingButton({
  tournamentId, playerId, declaredName,
}: {
  tournamentId: string; playerId: string; declaredName: string;
}) {
  const sync = useSyncCbxRating(tournamentId);
  const [result, setResult] = useState<CbxRatingResult | null>(null);
  const [err, setErr] = useState('');

  async function handleClick() {
    setErr('');
    try {
      setResult(await sync.mutateAsync(playerId));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const nameDiverges = !!result?.playerName && normalizeName(result.playerName) !== normalizeName(declaredName);

  return (
    <div className="mt-1 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={handleClick}
        disabled={sync.isPending}
        className="text-xs text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
      >
        {sync.isPending ? 'Consultando CBX…' : '🔄 Consultar rating CBX'}
      </button>
      {result && (
        <span className={`text-xs ${nameDiverges ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
          {result.fromCache ? 'já consultado este mês' : 'consultado agora'}
          {result.playerName && ` · CBX: ${result.playerName}`}
          {nameDiverges && ' ⚠ nome diverge — confira o ID'}
        </span>
      )}
      {err && <span className="text-xs text-red-500 dark:text-red-400">{err}</span>}
    </div>
  );
}
