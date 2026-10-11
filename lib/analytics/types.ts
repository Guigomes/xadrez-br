import type { DeviceType } from './device';
import type { TabStatRow } from './tournament-tabs';

export interface AccessSummary {
  last24Hours: number;
  last7Days: number;
  last30Days: number;
  uniqueDevices30Days: number;
}

export interface FollowedPlayer {
  id: string;
  name: string;
}

export interface AccessDevice {
  id: string;
  deviceType: DeviceType;
  browser: string;
  os: string;
  isOwner: boolean;
  ownerLabel: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastPath: string | null;
  lastCity: string | null;
  lastRegion: string | null;
  views30Days: number;
  followedPlayers: FollowedPlayer[];
}

export interface RecentAccess {
  id: number;
  deviceId: string;
  path: string;
  visitedAt: string;
  city: string | null;
  region: string | null;
  isOwner: boolean;
  ownerLabel: string | null;
  deviceType: DeviceType;
  browser: string;
  os: string;
  followedPlayers: FollowedPlayer[];
}

export interface AccessDashboardData {
  summary: AccessSummary;
  devices: AccessDevice[];
  recent: RecentAccess[];
  /** Acessos por aba de torneio (sem robôs e sem aparelhos marcados como do dono). */
  tabStats: TabStatRow[];
  /** Nome dos torneios que aparecem em tabStats, pro seletor. */
  tabTournaments: Array<{ slug: string; name: string }>;
}
