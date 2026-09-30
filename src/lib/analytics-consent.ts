export type AnalyticsChoice = "accepted" | "rejected";
export const CONSENT_KEY = "dv-analytics-consent-v1";
export const CONSENT_DAYS = 180;
export const ANALYTICS_COOKIE_SECONDS = 30 * 86400;
export type PublicPages = Record<string, string>;
export type AnalyticsPage = { page_location: string; page_title: string; page_referrer: string };

export function readConsent(value: string | null, now = Date.now()): AnalyticsChoice | null {
  try {
    const saved = JSON.parse(value || "null");
    if (!saved || (saved.choice !== "accepted" && saved.choice !== "rejected") ||
        !Number.isFinite(saved.expires) || saved.expires <= now || saved.expires > now + CONSENT_DAYS * 86400000) return null;
    return saved.choice;
  } catch { return null; }
}

export function analyticsPage(pathname: string, pages: PublicPages): AnalyticsPage | null {
  // Only exact, known public paths. Never derive a title from DOM or user input.
  const path = pathname === "/" ? "/" : pathname.replace(/\/$/, "");
  if (!Object.hasOwn(pages, path)) return null;
  return {
    page_location: `https://dronevideography.lk${path}`,
    page_title: `${pages[path]} | Drone Videography LK`,
    // Deliberately omit referrer/UTM attribution for the initial basic setup.
    page_referrer: "",
  };
}

export type AnalyticsPort = {
  loadTag(): Promise<void>;
  command(...args: unknown[]): void;
  disable(value: boolean): void;
  clearAnalyticsCookies(): void;
};

/** One owner for page views; no config page view and no enhanced measurement. */
export class ConsentAnalytics {
  private accepted = false;
  private page: AnalyticsPage | null = null;
  private lastLocation: string | null = null;
  private loading?: Promise<void>;
  private configured = false;
  private revision = 0;

  constructor(private id: string, private port: AnalyticsPort) {
    port.disable(true);
  }

  async update(choice: AnalyticsChoice | null, page: AnalyticsPage | null): Promise<void> {
    if (choice === "accepted" && this.accepted && page && this.lastLocation === page.page_location) return;
    const revision = ++this.revision;
    const wasAccepted = this.accepted;
    this.accepted = choice === "accepted";
    this.page = page;
    if (!this.accepted || !page) {
      this.port.disable(true);
      this.lastLocation = null;
      if (!this.accepted) {
        this.port.clearAnalyticsCookies();
        if (this.configured && wasAccepted) {
          // Disable first: denied consent alone can still allow cookieless pings.
          this.port.command("consent", "update", { analytics_storage: "denied" });
        }
      }
      return;
    }

    if (!this.loading) {
      this.port.command("consent", "default", {
        analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
      });
      this.port.command("set", { allow_google_signals: false, allow_ad_personalization_signals: false, send_page_view: false });
      this.loading = this.port.loadTag().catch(error => { this.loading = undefined; throw error; });
    }
    try { await this.loading; } catch { return; }
    // Withdrawals/navigation during script download must cancel pending events.
    if (revision !== this.revision || !this.accepted || !this.page) return;
    this.port.command("set", this.page);
    this.port.disable(false);
    this.port.command("consent", "update", { analytics_storage: "granted" });
    if (!this.configured) {
      this.port.command("js", new Date());
      this.configured = true;
    }
    // Refresh tag defaults on navigation so automatic engagement events also
    // use the current sanitized page, rather than the initial page's details.
    this.port.command("config", this.id, {
        ...this.page, send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false, cookie_domain: "none", cookie_path: "/",
        cookie_expires: ANALYTICS_COOKIE_SECONDS, cookie_update: false,
        cookie_flags: "SameSite=Lax;Secure", ignore_referrer: true,
    });
    if (this.lastLocation !== this.page.page_location) {
      this.port.command("event", "page_view", { ...this.page, send_to: this.id });
      this.lastLocation = this.page.page_location;
    }
  }

  stop() {
    ++this.revision;
    this.accepted = false;
    this.lastLocation = null;
    this.port.disable(true);
  }
}
