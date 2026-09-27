export const SCHOOL_TOURNAMENT_SLUG = 'brasileiro-escolar-2026';

export type MedalKind = 'gold' | 'silver' | 'bronze';

export interface SchoolTournamentStatisticInput {
  participantId: string;
  playerName: string;
  playerTitle: string | null;
  rating: number | null;
  state: string | null;
  groupId: string | null;
  groupName: string | null;
  rank: number | null;
  points: number | null;
}

export interface MedalWin {
  medal: MedalKind;
  participantId: string;
  playerName: string;
  groupName: string;
}

export interface StateAthleteStatistic {
  participantId: string;
  playerName: string;
  playerTitle: string | null;
  rating: number | null;
  groupId: string | null;
  groupName: string;
  rank: number | null;
  points: number | null;
  medal: MedalKind | null;
}

export interface StateCategoryStatistic {
  key: string;
  label: string;
  participants: number;
  medals: number;
  averagePoints: number | null;
}

export interface StateStatistic {
  key: string;
  label: string;
  position: number;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
  participants: number;
  categories: number;
  averagePoints: number | null;
  medals: MedalWin[];
  athletes: StateAthleteStatistic[];
  categoryBreakdown: StateCategoryStatistic[];
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
    withState: number;
  };
  states: StateStatistic[];
  stateParticipation: ParticipationEntry[];
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
  athletes: StateAthleteStatistic[];
  categoryIds: Set<string>;
  pointsTotal: number;
  pointsCount: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function cleanLabel(value: string | null) {
  return value?.trim().replace(/\s+/g, ' ') || null;
}

function stateIdentity(value: string | null) {
  const label = cleanLabel(value)?.toUpperCase() ?? null;
  return label ? { key: label, label } : null;
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
    athletes: [],
    categoryIds: new Set<string>(),
    pointsTotal: 0,
    pointsCount: 0,
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

function medalWeight(medal: MedalKind | null) {
  if (medal === 'gold') return 0;
  if (medal === 'silver') return 1;
  if (medal === 'bronze') return 2;
  return 3;
}

function average(total: number, count: number) {
  return count > 0 ? total / count : null;
}

function addStateParticipant(
  map: Map<string, MutableEntity>,
  identity: { key: string; label: string } | null,
  row: SchoolTournamentStatisticInput,
) {
  if (!identity) return;

  const entity = entityFor(map, identity);
  if (entity.participantIds.has(row.participantId)) return;

  entity.participantIds.add(row.participantId);
  if (row.groupId || row.groupName) entity.categoryIds.add(row.groupId ?? row.groupName!);
  if (row.points != null) {
    entity.pointsTotal += row.points;
    entity.pointsCount += 1;
  }

  const medal = row.groupName ? medalForRank(row.rank) : null;
  entity.athletes.push({
    participantId: row.participantId,
    playerName: row.playerName,
    playerTitle: row.playerTitle,
    rating: row.rating,
    groupId: row.groupId,
    groupName: row.groupName ?? 'Sem categoria',
    rank: row.rank,
    points: row.points,
    medal,
  });

  if (!medal || !row.groupName) return;
  entity[medal] += 1;
  entity.medals.push({
    medal,
    participantId: row.participantId,
    playerName: row.playerName,
    groupName: row.groupName,
  });
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

function categoryBreakdown(athletes: StateAthleteStatistic[]): StateCategoryStatistic[] {
  const categories = new Map<string, {
    key: string;
    label: string;
    participants: number;
    medals: number;
    pointsTotal: number;
    pointsCount: number;
  }>();

  for (const athlete of athletes) {
    const key = athlete.groupId ?? athlete.groupName.toLocaleLowerCase('pt-BR');
    const category = categories.get(key) ?? {
      key,
      label: athlete.groupName,
      participants: 0,
      medals: 0,
      pointsTotal: 0,
      pointsCount: 0,
    };
    category.participants += 1;
    if (athlete.medal) category.medals += 1;
    if (athlete.points != null) {
      category.pointsTotal += athlete.points;
      category.pointsCount += 1;
    }
    categories.set(key, category);
  }

  return [...categories.values()]
    .map((category) => ({
      key: category.key,
      label: category.label,
      participants: category.participants,
      medals: category.medals,
      averagePoints: average(category.pointsTotal, category.pointsCount),
    }))
    .sort((a, b) => b.participants - a.participants || collator.compare(a.label, b.label));
}

function toStateStatistics(map: Map<string, MutableEntity>): StateStatistic[] {
  const sorted = [...map.values()].sort((a, b) =>
    b.gold - a.gold
    || b.silver - a.silver
    || b.bronze - a.bronze
    || collator.compare(a.label, b.label),
  );

  let previous: StateStatistic | null = null;
  return sorted.map((entity, index) => {
    const sameMedals = previous !== null
      && previous.gold === entity.gold
      && previous.silver === entity.silver
      && previous.bronze === entity.bronze;
    const position = sameMedals && previous ? previous.position : index + 1;
    const athletes = [...entity.athletes].sort((a, b) =>
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
      || collator.compare(a.groupName, b.groupName)
      || collator.compare(a.playerName, b.playerName),
    );
    const entry: StateStatistic = {
      key: entity.key,
      label: entity.label,
      position,
      gold: entity.gold,
      silver: entity.silver,
      bronze: entity.bronze,
      total: entity.gold + entity.silver + entity.bronze,
      participants: entity.participantIds.size,
      categories: entity.categoryIds.size,
      averagePoints: average(entity.pointsTotal, entity.pointsCount),
      medals: [...entity.medals].sort((a, b) =>
        medalWeight(a.medal) - medalWeight(b.medal)
        || collator.compare(a.groupName, b.groupName),
      ),
      athletes,
      categoryBreakdown: categoryBreakdown(athletes),
    };
    previous = entry;
    return entry;
  });
}

export function buildSchoolTournamentStatistics(
  rows: SchoolTournamentStatisticInput[],
): SchoolTournamentStatistics {
  const states = new Map<string, MutableEntity>();
  const categories = new Map<string, MutableEntity>();
  let withState = 0;

  for (const row of rows) {
    const state = stateIdentity(row.state);
    const groupLabel = cleanLabel(row.groupName);
    const group = groupLabel
      ? { key: row.groupId ?? groupLabel.toLocaleLowerCase('pt-BR'), label: groupLabel }
      : null;

    if (state) withState += 1;
    addStateParticipant(states, state, row);

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
      withState,
    },
    states: toStateStatistics(states),
    stateParticipation: toParticipation(states),
    categoryParticipation: toParticipation(categories),
  };
}
