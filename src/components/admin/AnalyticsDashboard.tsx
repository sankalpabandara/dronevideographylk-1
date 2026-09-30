"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import type { AnalyticsPeriod, AnalyticsResponse, AnalyticsRow, HistoryReport, RealtimeReport } from "@/lib/analytics-types";

const format = (value: number) => new Intl.NumberFormat("en").format(value);

function useReport<T>(url: string, interval: number) {
  const [result, setResult] = useState<{ url: string; response: AnalyticsResponse<T> }>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const load = async () => {
      if (disposed || busy || document.hidden) return;
      busy = true;
      setLoading(true);
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const body = await response.json() as AnalyticsResponse<T>;
        if (!response.ok || !["connected", "not_configured", "unavailable"].includes(body.status)) {
          throw new Error(response.status === 401 ? "Your admin session ended. Sign in again to view analytics." : "Analytics could not refresh. Try again shortly.");
        }
        if (!disposed) setResult({ url, response: body });
      } catch (error) {
        if (!disposed) setResult({ url, response: { status: "unavailable", message: error instanceof Error && error.message.startsWith("Your admin") ? error.message : "Analytics could not refresh. Try again shortly." } });
      } finally {
        clearTimeout(timeout);
        busy = false;
        if (!disposed) {
          setLoading(false);
          timer = setTimeout(load, interval);
        }
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void load();
    };
    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url, interval, revision]);
  return { response: result?.url === url ? result.response : undefined, loading, refresh: () => setRevision(n => n + 1) };
}

type LiveState = ReturnType<typeof useReport<RealtimeReport>>;
const LiveContext = createContext<LiveState | null>(null);

export function AdminAnalytics({ children }: { children: React.ReactNode }) {
  const live = useReport<RealtimeReport>("/api/admin/analytics?view=realtime", 60000);
  const connected = live.response?.status === "connected" ? live.response : null;
  return (
    <LiveContext.Provider value={live}>
      <section aria-label="Google Analytics live summary" className="mb-7 rounded-2xl border border-night/10 bg-white p-4 text-night sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-600" : "bg-night/30"}`} />
            Google Analytics
            <span className="font-normal text-night/60">{connected ? "Last 30 minutes" : live.response?.status === "unavailable" ? "Unavailable" : live.response ? "Not connected" : "Checking connection…"}</span>
          </div>
          <Link href="/admin/analytics" className="text-sm font-semibold text-ocean underline underline-offset-4">View analytics</Link>
        </div>
        {connected ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-7 gap-y-2 text-sm">
            <p><strong className="mr-1 text-2xl">{format(connected.data.activeUsers)}</strong> active users</p>
            <p><strong className="mr-1 text-2xl">{format(connected.data.pageViews)}</strong> page views</p>
            <p className="text-xs text-night/55">Updated {new Date(connected.data.updatedAt).toLocaleTimeString()} · refreshes every minute</p>
          </div>
        ) : <p className="mt-2 text-sm text-night/60">{live.response && live.response.status !== "connected" ? live.response.message : "Checking the reporting connection. Visitor tracking is configured separately."}</p>}
      </section>
      {children}
    </LiveContext.Provider>
  );
}

function Notice({ message }: { message: string }) {
  return <div role="status" className="rounded-2xl border border-night/10 bg-white p-6 text-sm text-night/70">{message}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-night/10 bg-white p-5"><p className="text-sm text-night/60">{label}</p><p className="mt-2 font-display text-3xl font-semibold text-night">{value}</p></div>;
}

function Bars({ rows, label }: { rows: AnalyticsRow[]; label: string }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  if (!rows.length) return <p className="py-8 text-sm text-night/60">No data reported for this period.</p>;
  return (
    <div>
      <div role="img" aria-label={label} className="flex h-36 items-end gap-1 border-b border-night/10 pt-4">
        {rows.map((row, index) => <div key={`${row.label}-${index}`} title={`${row.label}: ${format(row.value)} page views`} className="min-w-0 flex-1 rounded-t bg-ocean/80" style={{ height: row.value ? `${Math.max(2, row.value / max * 100)}%` : 0 }} />)}
      </div>
      <div className="mt-2 flex justify-between text-xs text-night/60"><span>{rows[0].label}</span><span>{rows[rows.length - 1].label}</span></div>
      <details className="mt-3 text-sm text-night/65"><summary className="cursor-pointer">View values</summary><ul className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-auto">{rows.map((row, index) => <li key={`${row.label}-${index}`}>{row.label}: {format(row.value)}</li>)}</ul></details>
    </div>
  );
}

function Ranking({ title, metric, rows }: { title: string; metric: string; rows: AnalyticsRow[] }) {
  return (
    <section className="min-w-0 rounded-2xl border border-night/10 bg-white p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-night">{title}</h2>
      {rows.length ? <table className="mt-4 w-full table-fixed text-left text-sm">
        <thead><tr className="border-b border-night/10 text-xs text-night/55"><th scope="col" className="w-2/3 pb-2 font-normal">{title === "Popular pages" ? "Page" : "Category"}</th><th scope="col" className="pb-2 text-right font-normal">{metric}</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label} className="border-b border-night/5 last:border-0"><th scope="row" className="break-words py-3 pr-3 font-normal text-night/80">{row.label}</th><td className="py-3 text-right tabular-nums text-night">{format(row.value)}</td></tr>)}</tbody>
      </table> : <p className="mt-4 text-sm text-night/60">No data reported for this period.</p>}
    </section>
  );
}

function HistoricalReports({ days }: { days: AnalyticsPeriod }) {
  const report = useReport<HistoryReport>(`/api/admin/analytics?view=history&days=${days}`, 300000);
  const response = report.response;
  if (!response) return <Notice message="Loading reports…" />;
  if (response.status !== "connected") return <Notice message={response.message} />;
  const data = response.data;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active users" value={format(data.activeUsers)} />
        <Metric label="Sessions" value={format(data.sessions)} />
        <Metric label="Page views" value={format(data.pageViews)} />
        <Metric label="Engagement rate" value={`${(data.engagementRate * 100).toFixed(1)}%`} />
      </div>
      <section className="rounded-2xl border border-night/10 bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-night">Page views over time</h2>
        <p className="mt-1 text-xs text-night/55">Last {data.days} completed days · {data.timeZone}. Recent data may still be processing.</p>
        <Bars rows={data.trend} label={`Daily page views over the last ${data.days} completed days. Expand View values for exact counts.`} />
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <Ranking title="Popular pages" metric="Page views" rows={data.pages} />
        <Ranking title="Traffic channels" metric="Sessions" rows={data.channels} />
        <Ranking title="Countries" metric="Active users" rows={data.countries} />
        <Ranking title="Devices" metric="Active users" rows={data.devices} />
      </div>
      {data.limited && <Notice message="Google applied reporting limits, sampling or privacy thresholds to one or more reports. Some data may be grouped or withheld." />}
      <p className="text-xs text-night/55">Updated {new Date(data.updatedAt).toLocaleString()} · reports refresh every five minutes. Tables show up to ten categories; they are not totals.</p>
    </div>
  );
}

export function AnalyticsDashboard() {
  const live = useContext(LiveContext);
  const [days, setDays] = useState<AnalyticsPeriod>(28);
  const [historyRevision, setHistoryRevision] = useState(0);
  const connected = live?.response?.status === "connected" ? live.response : null;
  return (
    <div className="max-w-7xl space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="font-display text-3xl font-semibold text-night">Website analytics</h1><p className="mt-2 max-w-2xl text-sm text-night/60">Your audience and traffic, here in your admin panel. Reports cover measured visits; visitors who reject analytics are not counted.</p></div>
        <button disabled={live?.loading} onClick={() => { live?.refresh(); setHistoryRevision(n => n + 1); }} className="rounded-lg border border-night/15 bg-white px-4 py-2.5 text-sm font-semibold text-night hover:border-ocean disabled:opacity-50">{live?.loading ? "Refreshing…" : "Refresh reports"}</button>
      </div>
      {connected && <p className="text-xs text-night/55">GA4 property {connected.propertyId} · Web stream {connected.streamId}</p>}
      {connected ? <section className="rounded-2xl border border-night/10 bg-white p-5 sm:p-6"><h2 className="font-display text-lg font-semibold text-night">Realtime page views</h2><p className="mt-1 text-sm text-night/60">Last 30 minutes, grouped by minute. This is a rolling activity window, not a count of people currently on the page.</p><Bars rows={connected.data.minutes} label="Page views per minute in the last 30 minutes. Expand View values for exact counts." /></section> : live?.response?.status === "not_configured" ? <Notice message="Connection pending. Once the correct Google property and read-only reporting access are approved, your real reports will appear here. No example numbers are shown and this dashboard does not install visitor tracking." /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-night">Traffic reports</h2>
        <label className="flex items-center gap-3 text-sm text-night/70">Date range<select value={days} onChange={event => setDays(Number(event.target.value) as AnalyticsPeriod)} className="rounded-lg border border-night/15 bg-white px-3 py-2 text-night"><option value={7}>Last 7 completed days</option><option value={28}>Last 28 completed days</option><option value={90}>Last 90 completed days</option></select></label>
      </div>
      <HistoricalReports key={historyRevision} days={days} />
      <p className="text-xs leading-relaxed text-night/55">Read-only reports. Google reporting delays and privacy thresholds can affect results. Refresh pauses while this tab is hidden. Analytics account settings and advanced Google-only tools are not changed here.</p>
    </div>
  );
}
