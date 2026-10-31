import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandingRow } from '../../../types/database';
import { buildPodiumOptions, podiumPhotoUrl, startPodiumCeremony } from '../podium';

const row = (patch: Partial<StandingRow> = {}): StandingRow => ({
  rank: 1, player_id: 'player-1', tp_id: 'tp-1', full_name: 'Ana Silva', fide_name: null, title: null,
  points: 4, games_played: 5, wins: 3, draws: 2, losses: 0, initial_ranking: 2,
  federation: 'BRA', state: 'MS', rating_std: 1800, rating_tempo: 1900,
  buchholz: 10, buchholz_cut1: 7, sonneborn_berger: 8, progressive: 12, performance_rating: null,
  pairing_group_id: 'group-a', pairing_group_name: 'Absoluto', category_id: 'sub-10', category_name: 'Sub-10',
  player_status: 'active', sex: 'w', ...patch,
});
const rows = [row(), row({ rank: 2, player_id: 'player-2', tp_id: 'tp-2', full_name: 'Bruno', points: 4, sex: 'm', category_id: 'sub-12', category_name: 'Sub-12' }),
  row({ rank: 3, player_id: 'player-3', tp_id: 'tp-3', full_name: 'Carla', points: 3 }),
  row({ rank: 4, player_id: 'player-4', tp_id: 'tp-4', full_name: 'Dora', points: 2 })];

describe('podium cuts follow final standings', () => {
  it.each(['draft', 'published', 'registration', 'registration_closed', 'ongoing', 'cancelled'])('does not produce awards while %s', (status) => {
    expect(buildPodiumOptions(rows, { status })).toEqual([]);
  });
  it('preserves the official absolute podium and its tiebreak order, not seed or name order', () => {
    const podium = buildPodiumOptions(rows, { status: 'finished' })[0];
    expect(podium.label).toBe('Absoluto');
    expect(podium.players.map((player) => [player.position, player.playerId])).toEqual([[1, 'player-1'], [2, 'player-2'], [3, 'player-3']]);
    expect(rows[3].rank).toBe(4);
  });
  it('reindexes categories and the configured female cut within their group', () => {
    const options = buildPodiumOptions(rows, { status: 'finished', has_female_classification: true });
    expect(options.find((option) => option.label === 'Sub-10')?.players.map((player) => [player.position, player.name])).toEqual([[1, 'Ana Silva'], [2, 'Carla'], [3, 'Dora']]);
    expect(options.find((option) => option.label === 'Feminino')?.players.map((player) => player.playerId)).toEqual(['player-1', 'player-3', 'player-4']);
    expect(options.find((option) => option.label === 'Sub-12')?.players).toHaveLength(1);
  });
  it('respects disabled absolute/female awards, with the same no-category fallback as StandingsView', () => {
    const options = buildPodiumOptions(rows, { status: 'finished', has_absolute_classification: false });
    expect(options.map((option) => option.label)).toEqual(['Sub-10', 'Sub-12']);
    expect(buildPodiumOptions([row({ category_id: null, category_name: null })], { status: 'finished', has_absolute_classification: false })[0].label).toBe('Absoluto');
  });
  it('never combines ranks of separate pairing groups, including identical category names', () => {
    const options = buildPodiumOptions([...rows, row({ player_id: 'other', pairing_group_id: 'group-b', pairing_group_name: 'Feminino' })], { status: 'finished' });
    expect(options.filter((option) => option.id.endsWith(':all')).map((option) => option.label)).toEqual(['Absoluto · Absoluto', 'Feminino · Absoluto']);
    expect(options.find((option) => option.id === 'group-b:all')?.players.map((player) => player.playerId)).toEqual(['other']);
    expect(options.find((option) => option.id === 'group-a:all')?.players).toHaveLength(3);
  });
  it('does not invent missing positions or use an initial seed to fill a missing final rank', () => {
    const podium = buildPodiumOptions([row({ rank: null }), row({ rank: 2, player_id: 'silver' })], { status: 'finished' })[0];
    expect(podium.players.map((player) => player.position)).toEqual([2]);
    expect(buildPodiumOptions([], { status: 'finished' })).toEqual([]);
  });
  it('encodes only a scoped podium photo endpoint, never a private bucket URL', () => {
    const url = podiumPhotoUrl('event', 'group-a:category:sub-10', 'player-1');
    expect(url).toBe('/api/tournaments/event/podium-photo?category=group-a%3Acategory%3Asub-10&player=player-1');
    expect(url).not.toContain('storage');
  });
});

describe('slow ceremony timeline', () => {
  afterEach(() => vi.useRealTimers());
  it('reveals bronze at 1.5s, silver at 6s, then gold at 10.5s', () => {
    vi.useFakeTimers(); const reveal = vi.fn(); const stop = startPodiumCeremony(reveal, false);
    vi.advanceTimersByTime(1499); expect(reveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(reveal).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(4500); expect(reveal).toHaveBeenLastCalledWith(2);
    vi.advanceTimersByTime(4500); expect(reveal).toHaveBeenLastCalledWith(3);
    stop();
  });
  it('cancels pending reveals on category change, replay or leaving the podium', () => {
    vi.useFakeTimers(); const reveal = vi.fn(); const stop = startPodiumCeremony(reveal, false);
    vi.advanceTimersByTime(1500); stop(); vi.runAllTimers(); expect(reveal.mock.calls).toEqual([[1]]);
  });
  it('shows everyone immediately for reduced motion, with no timer', () => {
    vi.useFakeTimers(); const reveal = vi.fn(); startPodiumCeremony(reveal, true)();
    expect(reveal.mock.calls).toEqual([[3]]); expect(vi.getTimerCount()).toBe(0);
  });
  it('skips absent bronze and silver awards rather than pausing on empty podium places', () => {
    vi.useFakeTimers(); const reveal = vi.fn();
    startPodiumCeremony(reveal, false, [1]);
    vi.advanceTimersByTime(1500); expect(reveal.mock.calls).toEqual([[3]]);
    expect(vi.getTimerCount()).toBe(0);
    reveal.mockClear(); startPodiumCeremony(reveal, false, [1, 2]);
    vi.advanceTimersByTime(1500); expect(reveal.mock.calls).toEqual([[2]]);
    vi.advanceTimersByTime(4500); expect(reveal.mock.calls).toEqual([[2], [3]]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not schedule awards for an empty category', () => {
    vi.useFakeTimers(); const reveal = vi.fn(); startPodiumCeremony(reveal, false, []);
    expect(vi.getTimerCount()).toBe(0); expect(reveal).not.toHaveBeenCalled();
  });
});
