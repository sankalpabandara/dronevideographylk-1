export type AnalyticsPeriod = 7 | 28 | 90;
export type AnalyticsRow = { label: string; value: number };
export type RealtimeReport = {
  updatedAt: string;
  activeUsers: number;
  pageViews: number;
  minutes: AnalyticsRow[];
};
export type HistoryReport = {
  updatedAt: string;
  days: AnalyticsPeriod;
  timeZone: string;
  limited: boolean;
  activeUsers: number;
  sessions: number;
  pageViews: number;
  engagementRate: number;
  trend: AnalyticsRow[];
  pages: AnalyticsRow[];
  channels: AnalyticsRow[];
  countries: AnalyticsRow[];
  devices: AnalyticsRow[];
};
export type AnalyticsResponse<T> =
  | { status: "connected"; propertyId: string; streamId: string; data: T }
  | { status: "not_configured" | "unavailable"; message: string };
