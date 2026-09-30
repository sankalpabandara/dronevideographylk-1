"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_COOKIE_SECONDS, analyticsPage, CONSENT_DAYS, CONSENT_KEY, ConsentAnalytics, readConsent, type AnalyticsChoice, type PublicPages } from "@/lib/analytics-consent";

declare global {
  interface Window {
    dvAnalyticsLayer?: unknown[];
    [key: `ga-disable-${string}`]: boolean;
  }
}

export function AnalyticsConsent({ measurementId, pages }: { measurementId: string; pages: PublicPages }) {
  const pathname = usePathname();
  const controller = useRef<ConsentAnalytics | null>(null);
  const pathRef = useRef(pathname);
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const preferences = useRef<HTMLButtonElement>(null);
  const storageBlocked = useRef(false);

  useEffect(() => {
    const target = window;
    const names = ["_ga", `_ga_${measurementId.slice(2)}`];
    const instance = controller.current ?? new ConsentAnalytics(measurementId, {
      disable(value) { target[`ga-disable-${measurementId}`] = value; },
      clearAnalyticsCookies() {
        // Delete only the two Analytics cookies; never inspect other cookie values.
        for (const name of names) {
          for (const domain of ["", `; Domain=${location.hostname}`, "; Domain=dronevideography.lk"]) {
            try { document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain}`; }
            catch { /* Restricted cookie access must not interrupt withdrawal. */ }
          }
        }
      },
      command() {
        target.dvAnalyticsLayer ??= [];
        // Google's documented gtag shim queues an Arguments object.
        // eslint-disable-next-line prefer-rest-params
        target.dvAnalyticsLayer.push(arguments);
      },
      loadTag() {
        return new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.async = true;
          script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}&l=dvAnalyticsLayer`;
          script.referrerPolicy = "no-referrer";
          script.onload = () => resolve();
          script.onerror = () => { script.remove(); reject(new Error("Analytics unavailable")); };
          document.head.appendChild(script);
        });
      },
    });
    controller.current = instance;
    const sync = () => {
      let saved: AnalyticsChoice | null = null;
      try { if (!storageBlocked.current) saved = readConsent(localStorage.getItem(CONSENT_KEY)); } catch { /* Fail closed. */ }
      setChoice(saved);
      setReady(true);
      void instance.update(saved, analyticsPage(pathRef.current, pages));
    };
    const storage = (event: StorageEvent) => { if (!event.key || event.key === CONSENT_KEY) sync(); };
    const visibility = () => { if (document.visibilityState === "visible") sync(); };
    sync();
    window.addEventListener("storage", storage);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", visibility);
    const expiry = window.setInterval(sync, 60000);
    return () => {
      instance.stop();
      window.removeEventListener("storage", storage);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", visibility);
      window.clearInterval(expiry);
    };
  }, [measurementId, pages]);

  useEffect(() => {
    pathRef.current = pathname;
    let saved: AnalyticsChoice | null = null;
    try { if (!storageBlocked.current) saved = readConsent(localStorage.getItem(CONSENT_KEY)); } catch { /* Fail closed. */ }
    void controller.current?.update(saved, analyticsPage(pathname, pages));
  }, [pathname, pages]);

  function choose(next: AnalyticsChoice) {
    // Stop immediately before persistence/UI work on withdrawal.
    if (next === "rejected") void controller.current?.update(next, null);
    let stored = true;
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice: next, expires: Date.now() + CONSENT_DAYS * 86400000 })); }
    catch {
      stored = false;
      try { localStorage.removeItem(CONSENT_KEY); } catch { /* Keep this page disabled. */ }
    }
    storageBlocked.current = !stored;
    const effective = stored ? next : "rejected";
    setStorageError(!stored);
    setChoice(effective);
    setOpen(false);
    void controller.current?.update(effective, analyticsPage(pathname, pages));
    preferences.current?.focus();
  }

  return (
    <div className="border-t border-white/15 bg-[#0b1929] px-4 py-4 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm">
        <button ref={preferences} type="button" onClick={() => setOpen(value => !value)} aria-expanded={ready && (open || choice === null)} aria-controls="analytics-preferences" className="rounded px-2 py-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">Analytics preferences</button>
        <span role="status" className="text-white/70">{choice === "accepted" ? "Analytics accepted" : "Analytics off"}{storageError ? " — your choice could not be saved; analytics remains off." : ""}</span>
      </div>
      {ready && (open || choice === null) && (
        <section id="analytics-preferences" aria-labelledby="analytics-heading" className="mx-auto mt-3 max-w-7xl rounded-xl border border-white/25 bg-[#142b43] p-5">
          <h2 id="analytics-heading" className="text-xl font-semibold">Your analytics choice</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/85">With your permission, we use Google Analytics to understand visits and improve this website. Analytics stays off unless you accept. You can change your choice here at any time. Enquiries and bookings work whichever option you choose.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => choose("accepted")} className="rounded-lg border border-white bg-white px-5 py-3 text-sm font-semibold text-[#142b43] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Accept analytics</button>
            <button type="button" onClick={() => choose("rejected")} className="rounded-lg border border-white bg-white px-5 py-3 text-sm font-semibold text-[#142b43] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{choice === "accepted" ? "Withdraw analytics consent" : "Reject analytics"}</button>
          </div>
          <details className="mt-4 max-w-3xl text-sm leading-6 text-white/85">
            <summary className="cursor-pointer font-semibold text-white">Analytics privacy notice</summary>
            <p className="mt-3">If you accept, Google Analytics 4 measures visits, public page views and general browser/device information. Google receives your IP address when requests reach its servers. We use fixed public page titles and remove URL query strings, fragments and referrers from the page information we send. We do not send form contents, booking details, names, emails or phone numbers as event parameters.</p>
            <p className="mt-3">We do not enable advertising personalization, Google Signals, User-ID or automatic form, search, link, download and video tracking. Admin and cart pages are excluded. This limits reports, including traffic-source attribution.</p>
            <p className="mt-3">Analytics cookies (_ga and _ga_{measurementId.slice(2)}) last up to {ANALYTICS_COOKIE_SECONDS / 86400} days without renewal on each visit. Your analytics choice is stored in this browser for {CONSENT_DAYS} days. User and event data retention is set to two months; Google may retain aggregated reports longer.</p>
            <p className="mt-3">Reject or withdraw at any time using Analytics preferences. Withdrawal blocks future Google Analytics collection and removes this site&apos;s Analytics cookies. It does not automatically erase data already collected. If storage is unavailable, analytics stays off.</p>
            <p className="mt-3">Google may process data outside Sri Lanka. Read <a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s Privacy Policy</a> and <a className="underline" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">how Google uses information from partner sites</a>. Contact us through the website about your privacy choices.</p>
            <p className="mt-3">This notice covers Google Analytics. The website also uses Cloudflare for performance measurement; this Google Analytics choice does not control that existing service.</p>
          </details>
        </section>
      )}
    </div>
  );
}
