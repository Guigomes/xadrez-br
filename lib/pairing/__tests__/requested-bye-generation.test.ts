import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { generateRoundDraft } from '../service';

describe('requested bye generation with the real Dutch engine', () => {
  it.each([[1, 0.5, 0.5], [2, 0.5, 0], [3, 0.5, 0], [1, 0, 0], [2, 0, 0]] as const)(
    'round %s with configuration %s persists %s points', async (target, configured, expected) => {
      const rounds = Array.from({ length: target - 1 }, (_, i) => ({
        id: `round-${i + 1}`, round_number: i + 1, status: 'finished',
      }));
      const players = Array.from({ length: 6 }, (_, i) => ({
        id: `tp-${i + 1}`, initial_ranking: i + 1, status: 'active', joined_at_round: 1,
        players: { full_name: `Jogador ${i + 1}`, sex: null, fide_id: null, birth_year: null,
          federation: null, rating_std: 2000 - i * 50, rating_rpd: null, rating_blz: null },
      }));
      const history = [
        { round: 1, pairs: [[1, 4], [2, 5], [3, 6]] },
        { round: 2, pairs: [[1, 2], [3, 4], [5, 6]] },
      ].filter((round) => round.round < target).flatMap((round) => round.pairs.map(([white, black]) => ({
        round_id: `round-${round.round}`, white_tp_id: `tp-${white}`, black_tp_id: `tp-${black}`,
        result: '1/2-1/2', is_bye: false, bye_kind: null, white_points: 0.5, black_points: 0.5,
      })));
      const tables: Record<string, unknown> = {
        tournaments: { id: 'tournament', mode: 'native', tournament_type: 'swiss', name: 'Teste',
          rounds_count: 3, initial_color: 'white1', rating_kind: 'std', requested_bye_score: configured },
        pairing_groups: { id: 'group', name: 'Absoluto', rounds_count: 3 },
        rounds, tournament_players: players, pairings: history, requested_byes: [{ tp_id: 'tp-6' }],
      };
      const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: 'new-round', error: null }));
      const from = (table: string) => {
        const resolve = () => ({ data: tables[table], error: null });
        const query = {
          select: () => query, eq: () => query, order: () => query, in: () => query,
          single: async () => resolve(),
          then(done: (value: ReturnType<typeof resolve>) => unknown) { return Promise.resolve(resolve()).then(done); },
        };
        return query;
      };
      const client = { from, rpc } as unknown as SupabaseClient;
      const result = await generateRoundDraft(client, 'teste', 'group', target);
      expect(result.roundNumber).toBe(target);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0][0]).toBe('save_round_draft');
      const args = rpc.mock.calls[0][1];
      expect(args.p_round_number).toBe(target);
      const payload = args.p_pairings as Array<Record<string, unknown>>;
      expect(payload.find((board) => board.white_tp === 'tp-6')).toMatchObject({
        board: null, black_tp: null,
        bye_kind: expected === 0.5 ? 'requested_half' : 'requested_zero', points_w: expected,
      });
      // The odd-player automatic bye remains a full point, not the requested allowance.
      expect(payload.find((board) => board.bye_kind === 'pairing')).toMatchObject({ points_w: 1 });
      expect(payload).toHaveLength(4); // Two games, one requested bye and one automatic bye.
    },
  );
});
