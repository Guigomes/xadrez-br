import { describe, expect, it } from 'vitest';
import { buildSchoolTournamentStatistics, type SchoolTournamentStatisticInput } from '../school-tournament';

function row(
  participantId: string,
  state: string | null,
  school: string | null,
  groupName: string,
  rank: number,
): SchoolTournamentStatisticInput {
  return {
    participantId,
    playerName: `Jogador ${participantId}`,
    state,
    school,
    groupId: groupName,
    groupName,
    rank,
  };
}

describe('estatísticas do torneio escolar', () => {
  it('monta o quadro por ouro, prata e bronze de cada categoria', () => {
    const stats = buildSchoolTournamentStatistics([
      row('1', 'SP', 'Escola Alfa', '6 Abs', 1),
      row('2', 'MG', 'Escola Beta', '6 Abs', 2),
      row('3', 'SP', 'Escola Alfa', '6 Abs', 3),
      row('4', 'MG', 'ESCOLA BETA', '7 Fem', 1),
      row('5', 'SP', 'Escola Gama', '7 Fem', 2),
      row('6', 'MG', 'Escola Beta', '7 Fem', 3),
    ]);

    expect(stats.stateMedals.map(({ label, gold, silver, bronze }) => ({ label, gold, silver, bronze })))
      .toEqual([
        { label: 'MG', gold: 1, silver: 1, bronze: 1 },
        { label: 'SP', gold: 1, silver: 1, bronze: 1 },
      ]);
    expect(stats.stateMedals[0].position).toBe(1);
    expect(stats.stateMedals[1].position).toBe(1);
    expect(stats.schoolMedals.find((school) => school.key === 'escola beta'))
      .toMatchObject({ gold: 1, silver: 1, bronze: 1, participants: 3 });
  });

  it('mede a cobertura sem incluir dados ausentes nos rankings', () => {
    const stats = buildSchoolTournamentStatistics([
      row('1', ' MT ', 'Colégio Um', '8 Abs', 1),
      row('2', null, null, '8 Abs', 2),
      row('3', '', '  ', '8 Abs', 3),
    ]);

    expect(stats.summary).toEqual({
      participants: 3,
      categories: 1,
      states: 1,
      schools: 1,
      withState: 1,
      withSchool: 1,
    });
    expect(stats.stateParticipation).toEqual([{ key: 'MT', label: 'MT', participants: 1 }]);
  });
});
