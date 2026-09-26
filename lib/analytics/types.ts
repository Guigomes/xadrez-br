import type { DeviceType } from './device';

export interface AccessSummary {
  last24Hours: number;
  last7Days: number;
  last30Days: number;
  uniqueDevices30Days: number;
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
  views30Days: number;
}

export interface RecentAccess {
  id: number;
  deviceId: string;
  path: string;
  visitedAt: string;
  isOwner: boolean;
  ownerLabel: string | null;
  deviceType: DeviceType;
  browser: string;
  os: string;
}

export interface AccessDashboardData {
  summary: AccessSummary;
  devices: AccessDevice[];
  recent: RecentAccess[];
}
