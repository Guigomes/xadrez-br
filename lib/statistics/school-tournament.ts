export const SCHOOL_TOURNAMENT_SLUG = 'brasileiro-escolar-2026';

export type MedalKind = 'gold' | 'silver' | 'bronze';

export interface SchoolTournamentStatisticInput {
  participantId: string;
  playerName: string;
  state: string | null;
  school: string | null;
  groupId: string | null;
  groupName: string | null;
  rank: number | null;
}

export interface MedalWin {
  medal: MedalKind;
  playerName: string;
  groupName: string;
}

export interface MedalRankingEntry {
  key: string;
  label: string;
  position: number;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
  participants: number;
  medals: MedalWin[];
}

export interface ParticipationEntry {
  key: string;
  label: string;
  participants: number;
}

export interface SchoolTournamentStatistics {
  summary: {
    participants: number;
    categories: number;
    states: number;
    schools: number;
    withState: number;
    withSchool: number;
  };
  stateMedals: MedalRankingEntry[];
  schoolMedals: MedalRankingEntry[];
  stateParticipation: ParticipationEntry[];
  schoolParticipation: ParticipationEntry[];
  categoryParticipation: ParticipationEntry[];
}

interface MutableEntity {
  key: string;
  label: string;
  participantIds: Set<string>;
  gold: number;
  silver: number;
  bronze: number;
  medals: MedalWin[];
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function cleanLabel(value: string | null) {
  return value?.trim().replace(/\s+/g, ' ') || null;
}

function stateIdentity(value: string | null) {
  const label = cleanLabel(value)?.toUpperCase() ?? null;
  return label ? { key: label, label } : null;
}

function schoolIdentity(value: string | null) {
  const label = cleanLabel(value);
  return label ? { key: label.toLocaleLowerCase('pt-BR'), label } : null;
}

function entityFor(map: Map<string, MutableEntity>, identity: { key: string; label: string }) {
  const current = map.get(identity.key);
  if (current) return current;

  const created: MutableEntity = {
    ...identity,
    participantIds: new Set<string>(),
    gold: 0,
    silver: 0,
    bronze: 0,
    medals: [],
  };
  map.set(identity.key, created);
  return created;
}

function medalForRank(rank: number | null): MedalKind | null {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}

function addParticipant(
  map: Map<string, MutableEntity>,
  identity: { key: string; label: string } | null,
  row: SchoolTournamentStatisticInput,
) {
  if (!identity) return;

  const entity = entityFor(map, identity);
  entity.participantIds.add(row.participantId);

  const medal = medalForRank(row.rank);
  if (!medal || !row.groupName) return;

  entity[medal] += 1;
  entity.medals.push({ medal, playerName: row.playerName, groupName: row.groupName });
}

function toParticipation(map: Map<string, MutableEntity>): ParticipationEntry[] {
  return [...map.values()]
    .map((entity) => ({
      key: entity.key,
      label: entity.label,
      participants: entity.participantIds.size,
    }))
    .sort((a, b) => b.participants - a.participants || collator.compare(a.label, b.label));
}

function toMedalRanking(map: Map<string, MutableEntity>): MedalRankingEntry[] {
  const sorted = [...map.values()]
    .filter((entity) => entity.gold + entity.silver + entity.bronze > 0)
    .sort((a, b) =>
      b.gold - a.gold
      || b.silver - a.silver
      || b.bronze - a.bronze
      || collator.compare(a.label, b.label),
    );

  let previous: MedalRankingEntry | null = null;
  return sorted.map((entity, index) => {
    const sameMedals = previous !== null
      && previous.gold === entity.gold
      && previous.silver === entity.silver
      && previous.bronze === entity.bronze;
    const position = sameMedals && previous ? previous.position : index + 1;
    const entry: MedalRankingEntry = {
      key: entity.key,
      label: entity.label,
      position,
      gold: entity.gold,
      silver: entity.silver,
      bronze: entity.bronze,
      total: entity.gold + entity.silver + entity.bronze,
      participants: entity.participantIds.size,
      medals: [...entity.medals].sort((a, b) =>
        medalWeight(a.medal) - medalWeight(b.medal)
        || collator.compare(a.groupName, b.groupName),
      ),
    };
    previous = entry;
    return entry;
  });
}

function medalWeight(medal: MedalKind) {
  return medal === 'gold' ? 0 : medal === 'silver' ? 1 : 2;
}

export function buildSchoolTournamentStatistics(
  rows: SchoolTournamentStatisticInput[],
): SchoolTournamentStatistics {
  const states = new Map<string, MutableEntity>();
  const schools = new Map<string, MutableEntity>();
  const categories = new Map<string, MutableEntity>();
  let withState = 0;
  let withSchool = 0;

  for (const row of rows) {
    const state = stateIdentity(row.state);
    const school = schoolIdentity(row.school);
    const groupLabel = cleanLabel(row.groupName);
    const group = groupLabel
      ? { key: row.groupId ?? groupLabel.toLocaleLowerCase('pt-BR'), label: groupLabel }
      : null;

    if (state) withState += 1;
    if (school) withSchool += 1;

    addParticipant(states, state, row);
    addParticipant(schools, school, row);

    if (group) {
      const category = entityFor(categories, group);
      category.participantIds.add(row.participantId);
    }
  }

  return {
    summary: {
      participants: rows.length,
      categories: categories.size,
      states: states.size,
      schools: schools.size,
      withState,
      withSchool,
    },
    stateMedals: toMedalRanking(states),
    schoolMedals: toMedalRanking(schools),
    stateParticipation: toParticipation(states),
    schoolParticipation: toParticipation(schools),
    categoryParticipation: toParticipation(categories),
  };
}
