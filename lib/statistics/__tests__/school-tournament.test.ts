import { describe, expect, it } from 'vitest';
import { buildSchoolTournamentStatistics, type SchoolTournamentStatisticInput } from '../school-tournament';

function row(
  participantId: string,
  state: string | null,
  groupName: string,
  rank: number | null,
  points: number | null,
): SchoolTournamentStatisticInput {
  return {
    participantId,
    playerName: `Jogador ${participantId}`,
    playerTitle: null,
    rating: 1700 + Number(participantId),
    state,
    groupId: groupName,
    groupName,
    rank,
    points,
  };
}

describe('estatísticas do torneio escolar', () => {
  it('monta o quadro de medalhas e o detalhamento individual por UF', () => {
    const stats = buildSchoolTournamentStatistics([
      row('1', 'SP', '6 Abs', 1, 4),
      row('2', 'MG', '6 Abs', 2, 3),
      row('3', 'SP', '6 Abs', 3, 2),
      row('4', 'MG', '7 Fem', 1, 4),
      row('5', 'SP', '7 Fem', 2, 3),
      row('6', 'MG', '7 Fem', 3, 2),
    ]);

    expect(stats.states.map(({ label, gold, silver, bronze }) => ({ label, gold, silver, bronze })))
      .toEqual([
        { label: 'MG', gold: 1, silver: 1, bronze: 1 },
        { label: 'SP', gold: 1, silver: 1, bronze: 1 },
      ]);
    expect(stats.states[0]).toMatchObject({
      position: 1,
      participants: 3,
      categories: 2,
      averagePoints: 3,
    });
    expect(stats.states[0].athletes.map(({ participantId, groupName, rank, points }) => ({ participantId, groupName, rank, points })))
      .toEqual([
        { participantId: '2', groupName: '6 Abs', rank: 2, points: 3 },
        { participantId: '4', groupName: '7 Fem', rank: 1, points: 4 },
        { participantId: '6', groupName: '7 Fem', rank: 3, points: 2 },
      ]);
    expect(stats.states[0].categoryBreakdown).toEqual([
      { key: '7 Fem', label: '7 Fem', participants: 2, medals: 2, averagePoints: 3 },
      { key: '6 Abs', label: '6 Abs', participants: 1, medals: 1, averagePoints: 3 },
    ]);
  });

  it('mede a cobertura sem incluir atletas sem UF nos rankings estaduais', () => {
    const stats = buildSchoolTournamentStatistics([
      row('1', ' MT ', '8 Abs', 1, 3),
      row('2', null, '8 Abs', 2, 2),
      row('3', '', '8 Abs', 3, 1),
    ]);

    expect(stats.summary).toEqual({
      participants: 3,
      categories: 1,
      states: 1,
      withState: 1,
    });
    expect(stats.stateParticipation).toEqual([{ key: 'MT', label: 'MT', participants: 1 }]);
    expect(stats.categoryParticipation).toEqual([{ key: '8 Abs', label: '8 Abs', participants: 3 }]);
  });

  it('mantém estados sem medalha disponíveis para detalhamento', () => {
    const stats = buildSchoolTournamentStatistics([
      row('1', 'MS', '10 Abs', 8, 1.5),
      row('2', 'GO', '10 Abs', 1, 4),
    ]);

    expect(stats.states.map(({ label, total }) => ({ label, total }))).toEqual([
      { label: 'GO', total: 1 },
      { label: 'MS', total: 0 },
    ]);
    expect(stats.states[1].athletes[0]).toMatchObject({ playerName: 'Jogador 1', points: 1.5 });
  });
});
