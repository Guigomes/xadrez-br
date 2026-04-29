'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useTournament, useTournamentPlayers, useAddTournamentPlayer } from '@/lib/hooks/use-tournament';
import { usePlayerSearch, useCreatePlayer } from '@/lib/hooks/use-player';
import { createClient } from '@/lib/supabase/client';
import { PageSpinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatScore } from '@/lib/utils/chess';
import type { Player, PlayerFormValues } from '@/types/database';

interface ImportedParticipant {
  fullName: string;
  fideId?: string;
  federation?: string;
  ratingStd?: number;
  initialRanking?: number;
  type?: string;
  city?: string;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findColumnIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeText);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeText(header)));
}

function parseChessResultsRows(rows: unknown[][]): ImportedParticipant[] {
  const asStrings = rows.map((row) => row.map((cell) => String(cell ?? '').trim()));
  const headerRowIndex = asStrings.findIndex((row) =>
    row.some((cell) => normalizeText(cell) === 'nome')
    && row.some((cell) => normalizeText(cell) === 'id fide')
  );

  if (headerRowIndex < 0) {
    throw new Error('Cabeçalho do padrão Chess-Results não encontrado no arquivo.');
  }

  const headers = asStrings[headerRowIndex];
  const numberIdx = findColumnIndex(headers, ['nº.', 'nº', 'no.', 'no', 'num', 'numero']);
  const nameIdx = findColumnIndex(headers, ['nome']);
  const fideIdx = findColumnIndex(headers, ['id fide']);
  const fedIdx = findColumnIndex(headers, ['fed']);
  const eloIdx = findColumnIndex(headers, ['elo']);
  const typeIdx = findColumnIndex(headers, ['tipo']);
  const cityIdx = findColumnIndex(headers, ['clube/cidade', 'clube / cidade', 'clube cidade']);

  if (nameIdx < 0) {
    throw new Error('Coluna "Nome" não encontrada no arquivo.');
  }

  const participants: ImportedParticipant[] = [];

  for (const row of asStrings.slice(headerRowIndex + 1)) {
    const fullName = (row[nameIdx] ?? '').trim();
    if (!fullName) continue;

    const normalizedName = normalizeText(fullName);
    if (normalizedName.startsWith('encontrara todos os detalhes')) break;
    if (normalizedName.includes('chess-results')) continue;

    const fideIdRaw = fideIdx >= 0 ? (row[fideIdx] ?? '').trim() : '';
    const ratingRaw = eloIdx >= 0 ? (row[eloIdx] ?? '').trim() : '';
    const rankingRaw = numberIdx >= 0 ? (row[numberIdx] ?? '').trim() : '';
    const typeRaw = typeIdx >= 0 ? (row[typeIdx] ?? '').trim() : '';
    const cityRaw = cityIdx >= 0 ? (row[cityIdx] ?? '').trim() : '';

    const ratingStd = Number.parseInt(ratingRaw, 10);
    const initialRanking = Number.parseInt(rankingRaw, 10);

    participants.push({
      fullName,
      fideId: fideIdRaw || undefined,
      federation: fedIdx >= 0 ? ((row[fedIdx] ?? '').trim() || undefined) : undefined,
      ratingStd: Number.isFinite(ratingStd) && ratingStd > 0 ? ratingStd : undefined,
      initialRanking: Number.isFinite(initialRanking) && initialRanking > 0 ? initialRanking : undefined,
      type: typeRaw || undefined,
      city: cityRaw || undefined,
    });
  }

  return participants;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export default function AdminPlayersPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading } = useTournament(slug);
  const { data: tPlayers, isLoading: loadingPlayers } = useTournamentPlayers(tournament?.id ?? '');
  const addPlayer = useAddTournamentPlayer(tournament?.id ?? '');
  const createPlayer = useCreatePlayer();

  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const { data: searchResults } = usePlayerSearch(search);

  const [newPlayer, setNewPlayer] = useState<Partial<PlayerFormValues>>({});
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState('');
  const [error, setError] = useState('');

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p>Torneio não encontrado.</p>;

  async function handleAddExisting(player: Player) {
    try {
      await addPlayer.mutateAsync({ player_id: player.id });
      setSearch('');
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateAndAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const p = await createPlayer.mutateAsync(newPlayer as PlayerFormValues);
      await addPlayer.mutateAsync({ player_id: p.id });
      setNewPlayer({});
      setShowNewForm(false);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleImportSpreadsheet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tournament) return;

    setError('');
    setImportReport('');
    setImporting(true);

    try {
      const XLSX = await import('xlsx');
      const fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error('Planilha sem abas.');
      }

      const firstSheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        raw: false,
        defval: '',
      }) as unknown[][];

      const participants = parseChessResultsRows(rawRows);
      if (!participants.length) {
        throw new Error('Nenhum participante válido encontrado no arquivo.');
      }

      const supabase = createClient();
      const tournamentPlayerIds = new Set(
        (tPlayers ?? []).map((tp) => (tp as any).player?.id).filter(Boolean)
      );

      const { data: categoryRows } = await supabase
        .from('tournament_categories')
        .select('id, name')
        .eq('tournament_id', tournament.id);

      const categoryMap = new Map<string, string>();
      for (const row of categoryRows ?? []) {
        categoryMap.set(normalizeText(row.name), row.id);
      }

      let added = 0;
      let created = 0;
      let reused = 0;
      let skipped = 0;
      let failed = 0;

      for (const participant of participants) {
        try {
          let playerId: string | null = null;
          let categoryId: string | undefined;

          if (participant.type) {
            const normalizedType = normalizeText(participant.type);
            const existingCategoryId = categoryMap.get(normalizedType);

            if (existingCategoryId) {
              categoryId = existingCategoryId;
            } else {
              const { data: createdCategory, error: categoryErr } = await supabase
                .from('tournament_categories')
                .insert({ tournament_id: tournament.id, name: participant.type })
                .select('id, name')
                .single();

              if (categoryErr) throw categoryErr;
              categoryId = createdCategory.id;
              categoryMap.set(normalizedType, createdCategory.id);
            }
          }

          if (participant.fideId) {
            const { data: fideMatch } = await supabase
              .from('players')
              .select('id')
              .eq('fide_id', participant.fideId)
              .limit(1)
              .maybeSingle();

            if (fideMatch?.id) {
              playerId = fideMatch.id;
              reused += 1;
            }
          }

          if (!playerId) {
            const { data: nameMatches } = await supabase
              .from('players')
              .select('id, full_name')
              .ilike('full_name', participant.fullName)
              .limit(10);

            const exactNameMatch = nameMatches?.find(
              (match) => normalizeText(match.full_name) === normalizeText(participant.fullName)
            );

            if (exactNameMatch?.id) {
              playerId = exactNameMatch.id;
              reused += 1;

              if (participant.fideId || participant.city || participant.ratingStd) {
                await supabase
                  .from('players')
                  .update({
                    fide_id: participant.fideId,
                    city: participant.city,
                    rating_std: participant.ratingStd,
                    federation: participant.federation,
                  })
                  .eq('id', exactNameMatch.id);
              }
            }
          }

          if (!playerId) {
            const createdPlayer = await createPlayer.mutateAsync({
              full_name: participant.fullName,
              fide_id: participant.fideId,
              federation: participant.federation ?? 'BRA',
              rating_std: participant.ratingStd,
              city: participant.city,
            });
            playerId = createdPlayer.id;
            created += 1;
          }

          if (!playerId) {
            failed += 1;
            continue;
          }

          if (tournamentPlayerIds.has(playerId)) {
            skipped += 1;
            continue;
          }

          await addPlayer.mutateAsync({
            player_id: playerId,
            initial_ranking: participant.initialRanking,
            category_id: categoryId,
          });

          tournamentPlayerIds.add(playerId);
          added += 1;
        } catch (importErr: any) {
          const message = String(importErr?.message ?? '');
          if (message.includes('duplicate key') || message.includes('unique')) {
            skipped += 1;
          } else {
            failed += 1;
          }
        }
      }

      setImportReport(
        `Importação concluída: ${added} adicionados, ${created} novos cadastros, ${reused} já existentes, ${skipped} ignorados, ${failed} falhas.`
      );
    } catch (err: any) {
      setError(err.message ?? 'Erro ao importar planilha.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  const existingIds = new Set(tPlayers?.map((tp) => (tp as any).player?.id));

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">{tournament.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gerenciar participantes</p>
        </div>
        <Link
          href={`/admin/tournaments/${slug}/edit`}
          className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Voltar ao torneio
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {importReport && (
        <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          {importReport}
        </p>
      )}

      <div className="card p-4 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Importar participantes por planilha</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Envie um arquivo `.xlsx` no padrão Chess-Results (Ranking inicial). Os jogadores serão cadastrados e vinculados ao torneio.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={handleImportSpreadsheet}
            disabled={importing}
            className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
          />
          {importing && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Importando...</Badge>}
        </div>
      </div>

      {/* Search existing players */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Adicionar jogador existente</h2>
          <Button size="sm" onClick={() => setShowNewForm((v) => !v)}>
            {showNewForm ? 'Fechar cadastro' : 'Cadastrar participante'}
          </Button>
        </div>
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(searchResults?.length ?? 0) > 0 && (
          <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {searchResults!.filter((p) => !existingIds.has(p.id)).map((player) => (
              <div key={player.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{player.full_name}</p>
                  <p className="text-xs text-gray-400">{player.state} {player.rating_std ? `· ${player.rating_std}` : ''}</p>
                </div>
                <Button size="sm" onClick={() => handleAddExisting(player)} loading={addPlayer.isPending}>
                  Adicionar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New player form */}
      {showNewForm && (
        <form onSubmit={handleCreateAndAdd} className="card p-4 mb-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Novo jogador</h2>
          <Input label="Nome completo *" required value={newPlayer.full_name ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, full_name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Estado" value={newPlayer.state ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, state: e.target.value }))} />
            <Input label="Rating Std" type="number" value={newPlayer.rating_std ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, rating_std: parseInt(e.target.value) || undefined }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="ID CBX" value={newPlayer.cbx_id ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, cbx_id: e.target.value }))} />
            <Input label="ID FIDE" value={newPlayer.fide_id ?? ''} onChange={(e) => setNewPlayer((p) => ({ ...p, fide_id: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={createPlayer.isPending || addPlayer.isPending}>Cadastrar e adicionar</Button>
            <Button type="button" variant="ghost" onClick={() => setShowNewForm(false)}>Cancelar</Button>
          </div>
        </form>
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
            {tPlayers?.map((tp, i) => (
              <div key={tp.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs text-gray-400 w-5 text-center">{tp.initial_ranking ?? i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {(tp as any).player?.full_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(tp as any).category?.name && `${(tp as any).category.name} · `}
                    {(tp as any).player?.city ?? (tp as any).player?.state ?? ''}
                    {(tp as any).player?.rating_std ? ` · ${(tp as any).player.rating_std}` : ''}
                    {(tp as any).player?.fide_id ? ` · FIDE ${(tp as any).player.fide_id}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-brand-600 dark:text-brand-400 tabular-nums">
                  {formatScore(tp.current_score)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
