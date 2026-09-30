// Imported only by the server-only reporting module. No browser credentials.
import { createSign } from "node:crypto";
import { analyticsPublicPages } from "./analytics-public-pages";
import type { AnalyticsPeriod, AnalyticsRow, HistoryReport, RealtimeReport } from "./analytics-types";

export type Ga4Config = { propertyId: string; streamId: string; email: string; privateKey: string };
type Report = {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
  metadata?: { timeZone?: string; subjectToThresholding?: boolean; dataLossFromOtherRow?: boolean; samplingMetadatas?: unknown[] };
};
type Fetcher = typeof fetch;

export function parsePeriod(value: string | null): AnalyticsPeriod | null {
  if (value === null || value === "28") return 28;
  return value === "7" ? 7 : value === "90" ? 90 : null;
}

function metric(report: Report, index = 0): number {
  if (!report.rows?.length) return 0;
  return number(report.rows[0].metricValues?.[index]?.value);
}
function number(value: string | undefined): number {
  const result = value === undefined || value === "" ? NaN : Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error("Invalid report data");
  return result;
}
function rows(report: Report): AnalyticsRow[] {
  return (report.rows ?? []).map(row => ({
    label: row.dimensionValues?.[0]?.value || "(not set)",
    value: number(row.metricValues?.[0]?.value),
  }));
}

export function completeDailySeries(values: AnalyticsRow[], days: number, timeZone: string, now = new Date()): AnalyticsRow[] {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => Number(parts.find(value => value.type === name)?.value);
  const today = Date.UTC(part("year"), part("month") - 1, part("day"));
  const counts = new Map(values.map(row => [row.label.replace(/-/g, ""), row.value]));
  return Array.from({ length: days }, (_, index) => {
    const label = new Date(today - (days - index) * 86400000).toISOString().slice(0, 10);
    return { label, value: counts.get(label.replace(/-/g, "")) ?? 0 };
  });
}

// Only known public routes are rendered; arbitrary slugs can contain personal data.
export function publicPageLabel(value: string): string {
  const raw = value.split(/[?#]/, 1)[0];
  const path = raw === "/" ? "/" : raw.replace(/\/$/, "");
  return Object.hasOwn(analyticsPublicPages, path) ? path : "Other pages";
}

export class Ga4Client {
  private token?: { value: string; expires: number };
  private tokenPending?: Promise<string>;
  private cache = new Map<string, { expires: number; value: unknown }>();
  private pending = new Map<string, Promise<unknown>>();

  constructor(private config: Ga4Config, private request: Fetcher = fetch) {
    if (!/^\d+$/.test(config.propertyId) || !/^\d+$/.test(config.streamId) ||
        !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(config.email)) {
      throw new Error("Invalid analytics configuration");
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    if (this.tokenPending) return this.tokenPending;
    this.tokenPending = this.exchangeToken();
    try { return await this.tokenPending; } finally { this.tokenPending = undefined; }
  }

  private async exchangeToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
      iss: this.config.email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    })}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    const assertion = `${unsigned}.${signer.sign(this.config.privateKey, "base64url")}`;
    const response = await this.request("https://oauth2.googleapis.com/token", {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!response.ok) throw new Error("Google authentication unavailable");
    const data = await response.json();
    if (typeof data.access_token !== "string" || !Number.isFinite(data.expires_in) || data.expires_in <= 60) {
      throw new Error("Google authentication unavailable");
    }
    // Short-lived token stays in process memory; never persisted or returned to the UI.
    this.token = { value: data.access_token, expires: Date.now() + (Math.min(data.expires_in, 3600) - 60) * 1000 };
    return this.token.value;
  }

  private async post<T>(method: string, body: object): Promise<T> {
    const token = await this.accessToken();
    const response = await this.request(`https://analyticsdata.googleapis.com/v1beta/properties/${this.config.propertyId}:${method}`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      if (response.status === 401) this.token = undefined;
      // Never pass Google's error body, request headers or credentials to logs/UI.
      throw new Error("Google reporting unavailable");
    }
    return response.json();
  }

  private async cached<T>(key: string, ttl: number, run: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value as T;
    if (this.pending.has(key)) return this.pending.get(key) as Promise<T>;
    const pending = run().then(value => {
      this.cache.set(key, { value, expires: Date.now() + ttl });
      return value;
    });
    this.pending.set(key, pending);
    try { return await pending; } finally { this.pending.delete(key); }
  }

  private filter(history = false) {
    const exact = (fieldName: string, value: string) => ({ filter: { fieldName, stringFilter: { matchType: "EXACT", value } } });
    const expressions: object[] = [exact("streamId", this.config.streamId), exact("platform", "web")];
    if (history) expressions.push({ filter: { fieldName: "hostName", inListFilter: { values: ["dronevideography.lk", "www.dronevideography.lk"] } } });
    return { andGroup: { expressions } };
  }

  realtime(): Promise<RealtimeReport> {
    return this.cached("realtime", 30000, async () => {
      const common = { dimensionFilter: this.filter(), minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }] };
      const [totals, minutes] = await Promise.all([
        this.post<Report>("runRealtimeReport", { ...common, metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }] }),
        this.post<Report>("runRealtimeReport", { ...common, dimensions: [{ name: "minutesAgo" }], metrics: [{ name: "screenPageViews" }], limit: "30" }),
      ]);
      const byMinute = new Map(rows(minutes).map(row => [Number(row.label), row.value]));
      return {
        updatedAt: new Date().toISOString(), activeUsers: metric(totals), pageViews: metric(totals, 1),
        minutes: Array.from({ length: 30 }, (_, i) => ({ label: `${29 - i}m ago`, value: byMinute.get(29 - i) ?? 0 })),
      };
    });
  }

  history(days: AnalyticsPeriod): Promise<HistoryReport> {
    return this.cached(`history:${days}`, 300000, async () => {
      // Completed days avoid making partial data for today look like a traffic decline.
      const common = { dateRanges: [{ startDate: `${days}daysAgo`, endDate: "yesterday" }], dimensionFilter: this.filter(true) };
      const grouped = (dimension: string, metricName: string, limit = 10) => ({
        ...common, dimensions: [{ name: dimension }], metrics: [{ name: metricName }], limit: String(limit),
        orderBys: dimension === "date" ? [{ dimension: { dimensionName: "date" } }] : [{ metric: { metricName }, desc: true }],
      });
      // batchRunReports accepts at most five reports. Keep the sixth separate.
      const [batch, devices] = await Promise.all([
        this.post<{ reports: Report[] }>("batchRunReports", { requests: [
          { ...common, metrics: ["activeUsers", "sessions", "screenPageViews", "engagementRate"].map(name => ({ name })) },
          grouped("date", "screenPageViews", days), grouped("pagePath", "screenPageViews"),
          grouped("sessionDefaultChannelGroup", "sessions"), grouped("country", "activeUsers"),
        ] }),
        this.post<Report>("runReport", grouped("deviceCategory", "activeUsers")),
      ]);
      if (!Array.isArray(batch.reports) || batch.reports.length !== 5) throw new Error("Invalid report data");
      const [totals, trend, pages, channels, countries] = batch.reports;
      const timeZone = totals.metadata?.timeZone;
      if (!timeZone) throw new Error("Missing property time zone");
      const safePages = new Map<string, number>();
      for (const row of rows(pages)) {
        const label = publicPageLabel(row.label);
        safePages.set(label, (safePages.get(label) ?? 0) + row.value);
      }
      return {
        updatedAt: new Date().toISOString(), days, timeZone,
        limited: [...batch.reports, devices].some(r => r.metadata?.subjectToThresholding || r.metadata?.dataLossFromOtherRow || r.metadata?.samplingMetadatas?.length),
        activeUsers: metric(totals), sessions: metric(totals, 1), pageViews: metric(totals, 2), engagementRate: metric(totals, 3),
        trend: completeDailySeries(rows(trend), days, timeZone),
        pages: Array.from(safePages, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
        channels: rows(channels), countries: rows(countries), devices: rows(devices),
      };
    });
  }
}
