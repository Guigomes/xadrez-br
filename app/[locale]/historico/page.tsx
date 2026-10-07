'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useHistoryTournaments } from '@/lib/hooks/use-player-history';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';

const PAGE = 40;

const KIND_LABEL: Record<string, string> = { classical: 'Clássico', rapid: 'Rápido', blitz: 'Blitz', bullet: 'Bullet' };

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function HistoryPage() {
  const { data: tournaments, isLoading } = useHistoryTournaments();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [year, setYear] = useState('');
  const [onlyPgn, setOnlyPgn] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const years = useMemo(
    () => [...new Set((tournaments ?? []).map((t) => t.start_date.slice(0, 4)))].sort().reverse(),
    [tournaments],
  );

  const filtered = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return (tournaments ?? []).filter((t) => {
      if (kind && t.time_control_kind !== kind) return false;
      if (year && !t.start_date.startsWith(year)) return false;
      if (onlyPgn && t.pgn_count === 0) return false;
      const name = normalize(t.name);
      return words.every((w) => name.includes(w));
    });
  }, [tournaments, query, kind, year, onlyPgn]);

  if (isLoading) return <PageSpinner />;

  const totalPgn = (tournaments ?? []).reduce((s, t) => s + t.pgn_count, 0);
  const totalGames = (tournaments ?? []).reduce((s, t) => s + t.games_count, 0);

  return (
    <div className="container-app py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Histórico de torneios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Torneios trazidos de outras bases, só com as partidas jogadas: {(tournaments ?? []).length} torneios,{' '}
          {totalGames.toLocaleString('pt-BR')} partidas, {totalPgn.toLocaleString('pt-BR')} com lances (entre na conta para ver
          os lances).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          label="Buscar"
          placeholder="ex.: Floripa Chess Open"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
        />
        <Select label="Ritmo" value={kind} onChange={(e) => { setKind(e.target.value); setLimit(PAGE); }}>
          <option value="">Todos</option>
          <option value="classical">Clássico</option>
          <option value="rapid">Rápido</option>
          <option value="blitz">Blitz</option>
        </Select>
        <Select label="Ano" value={year} onChange={(e) => { setYear(e.target.value); setLimit(PAGE); }}>
          <option value="">Todos</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={onlyPgn}
          onChange={(e) => { setOnlyPgn(e.target.checked); setLimit(PAGE); }}
          className="h-4 w-4 accent-brand-600"
        />
        Só torneios com lances
      </label>

      {!filtered.length ? (
        <EmptyState icon="🔍" title="Nenhum torneio encontrado" description="Tente outro nome ou limpe os filtros." />
      ) : (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400">{filtered.length} {filtered.length === 1 ? 'torneio' : 'torneios'}</p>
          <ul className="space-y-2">
            {filtered.slice(0, limit).map((t) => (
              <li key={t.id}>
                <Link href={`/historico/${t.slug}`} className="card block px-4 py-3 hover:border-brand-400 transition-colors">
                  <p className="font-medium text-gray-900 dark:text-gray-100 break-words">{t.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatDate(t.start_date)}{t.date_approx ? ' (data aproximada)' : ''}
                    {KIND_LABEL[t.time_control_kind] && ` · ${KIND_LABEL[t.time_control_kind]}`}
                    {t.homologated === true && ' · ✅ homologado'}
                    {t.homologated === false && ' · não homologado'}
                  </p>
                  {t.series && (
                    <p className="text-xs text-brand-700 dark:text-brand-300 mt-1">
                      Circuito: {t.series.name}{t.series_label ? ` · ${t.series_label}` : ''}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{t.players_count} jogadores</Badge>
                    <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{t.games_count} partidas</Badge>
                    <Badge className={cn(t.pgn_count > 0 ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500')}>
                      {t.pgn_count > 0 ? `♟ ${t.pgn_count} com lances` : 'sem lances'}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="w-full rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
            >
              mostrar mais ({filtered.length - limit} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
}
