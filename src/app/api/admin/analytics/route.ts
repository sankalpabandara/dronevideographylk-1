import { isAuthenticated, usingDefaults } from "@/lib/auth";
import { analyticsClient, analyticsDestination } from "@/lib/analytics-server";
import { parsePeriod } from "@/lib/ga4-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return json({ status: "unavailable", message: "Sign in to view analytics." }, 401);
  if (process.env.NODE_ENV === "production" && usingDefaults()) {
    return json({ status: "unavailable", message: "Analytics access requires a configured admin login." }, 503);
  }
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "realtime";
  const period = parsePeriod(url.searchParams.get("days"));
  if (!["realtime", "history"].includes(view) || period === null) {
    return json({ status: "unavailable", message: "Choose a supported report and date range." }, 400);
  }
  try {
    const client = analyticsClient();
    if (!client) return json({ status: "not_configured", message: "Google Analytics is not connected yet. Your property and read-only access need to be confirmed." });
    const data = view === "realtime" ? await client.realtime() : await client.history(period);
    return json({ status: "connected", ...analyticsDestination(), data });
  } catch {
    return json({ status: "unavailable", message: "Analytics could not refresh. Check the Google connection or try again later." }, 503);
  }
}
