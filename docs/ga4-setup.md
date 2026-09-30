# GA4 collection and private admin reports

This change prepares GA4 and an admin dashboard. **Visitor collection and Google reporting requests are disabled by default.** No credentials, account permissions, deployment secrets, DNS or hosting settings are changed by this PR.

## Verified destination

| Setting | Value |
| --- | --- |
| Account / property name | Drone Videography LK |
| Account ID | 410203227 |
| Property ID | 556761523 |
| Web stream ID | 15888838415 |
| Measurement ID | G-J9EEQQNY87 |
| Website | https://dronevideography.lk |
| Timezone / currency | Sri Lanka (GMT+05:30) / LKR |

These public identifiers were verified in Analytics. Enhanced measurement, Google Signals and user-provided data are off. Ads personalization is disallowed in all regions. User/event retention is two months with reset on new activity off. No product links were created. Google has not received test visits from this implementation yet.

## Visitor consent and collection

`GA4_COLLECTION_ENABLED=true` is required at **build time**, followed by a new deployment, to render the consent component in the public site layout. This flag has not been enabled. The fixed Measurement ID is in `src/lib/ga4-destination.ts`.

The panel appears after the existing footer, without covering page content. Accept and Reject have equal prominence, and Analytics preferences remains available for withdrawal. The expanded notice explains Google processing, cookie durations, withdrawal and the existing Cloudflare measurement separately. The owner must review this notice before activating collection; it is not a complete website privacy policy.

- No Google script is loaded without accepted consent.
- Rejection/withdrawal sets Google's `ga-disable` guard before a consent update and removes only the two Analytics cookies. Denied consent mode alone is insufficient because it can allow cookieless pings.
- Consent lasts 180 days in local storage. Analytics cookies expire after 30 days without renewal on visits. Storage events, pageshow/visibility checks and an expiry timer synchronize choices; inaccessible storage fails closed.
- Only exact public paths from the static catalog are permitted. Fixed titles and canonical URLs omit query strings, fragments and referrers. Admin/cart/unknown routes are excluded. Form/booking values and WhatsApp URLs are never read.
- One manual `page_view` source handles initial load and client navigation. Every tag configuration disables automatic page views. Google may send normal session/engagement events after consent.
- Advertising consent remains denied; Signals, ad personalization, User-ID and enhanced form/search/link/video/download tracking are not enabled.
- Referrer/UTM attribution is deliberately omitted initially, so channel reports will be limited.

## Private admin reports

`/admin/analytics` and a summary bar on authenticated admin pages show active users/page views in the last 30 minutes. This is not a simultaneous visitor count. The bar polls once per minute while visible. Historical reports cover 7, 28 or 90 completed days, with daily views, popular pages, countries, devices and channels. Historical data refreshes every five minutes and may lag collection. Missing configuration and errors are labelled explicitly, never substituted with zero or sample values.

Every API request verifies the existing admin session. Production reporting also refuses to operate with unconfigured admin authentication. Only fixed queries, the verified property/stream and allowed date windows are available; browser callers cannot select another destination. Historical queries also filter the website hostname. Realtime queries use the web stream/platform because the Realtime API does not support hostname filtering.

The server uses read-only Google Analytics Data API access with short-lived tokens held only in process memory. Browser responses contain aggregate reports, never credentials. HTTP responses are private/no-store; per-process memory caches coalesce requests and reduce quota consumption. No raw Google errors are returned or logged.

### Configuration, only after owner approval

| Server-only variable | Value or purpose |
| --- | --- |
| `GA4_REPORTS_ENABLED` | Exactly `true` to permit reporting requests |
| `GA4_PROPERTY_ID` | `556761523`; mismatches fail closed |
| `GA4_STREAM_ID` | `15888838415`; mismatches fail closed |
| `GA4_SERVICE_ACCOUNT_EMAIL` | Dedicated reporting identity |
| `GA4_SERVICE_ACCOUNT_PRIVATE_KEY` | Owner-managed signing key, never committed or placed in a `NEXT_PUBLIC_*` variable |

The proposed identity needs **Viewer on this property only**, the `analytics.readonly` scope and the Analytics Data API. Granting access, creating/provisioning credentials and enabling the API have not been performed. The owner must approve this additional permission and privately provision credentials. Prefer a keyless deployment identity where supported; that would require adapting the current signing-key adapter. Never copy browser login cookies/tokens or put keys in chat, logs or this repository.

## Validation and rollout gates

Local tests cover signing/scoping, unauthorized access, caching, report failures, complete-day ranges, timezone handling, rejection, withdrawal during tag loading, rapid navigation, retry and page-view deduplication. They use synthetic credentials/mocked Google responses or a simulated tag port. They are not live GA verification.

Run:

```sh
node --test tests/analytics.test.mjs tests/analytics-consent.test.mjs
npm run lint
npm audit
npx tsc --noEmit
npm run build
```

The consent/dashboard components were reviewed in Chrome desktop and 390px mobile previews, including remembered rejection and withdrawal after reload. Preview Google requests were blocked by CSP and dashboard numbers were explicitly synthetic.

Before activation:

1. Obtain owner review of the panel/notice and reporting permission proposal.
2. Provision approved reporting access privately and compare real reports against GA4 for the same property, stream, date window and timezone. Check quota and revocation/failure behavior.
3. Test actual GA traffic with Tag Assistant and Realtime/DebugView. Confirm no requests/cookies before acceptance, after rejection or after withdrawal, including other tabs and reloads. Check no duplicate page views and no PII in actual event payloads.
4. Check important public pages, admin reports, mobile layouts and form/booking controls without real submissions. These full production checks remain pending.

The repository's current workflow deploys pushes to `main` to Contabo. Opening this PR does not merge it or publish these changes. Preserve unrelated unpublished work.

### Pre-merge security and regression review

Next.js and its ESLint configuration were updated from 16.2.12 to 16.3.7, with compatible lockfile security updates. The initial dependency audit reported one critical and five high package findings; the updated audit reported zero known vulnerabilities. This is a dependency database result, not a guarantee against unknown vulnerabilities.

The review fixed a reproduced rapid-navigation race that could send a stale page view, blocked redirects on credential-bearing Google requests, and made cookie cleanup tolerant of restricted browser storage. Tests also cover production refusal with unconfigured admin authentication and mismatched destinations. Existing mobile menu and floating-contact effects were corrected without changing their design.

Validation: all 19 automated tests, full ESLint, TypeScript and the production build passed. On the production-mode local server, missing and synthetic invalid sessions both received 401 with private/no-store headers. Home, fleet, portfolio, shop, contact and cart returned 200 with collection disabled and no Google tag script. Chrome mobile checks confirmed route navigation closes the menu, contact controls render without horizontal overflow, and the booking dialog opens/closes without submission; no console warnings/errors were observed in those checks.

This review covers the changed implementation and its immediate integration boundaries. It is not a penetration test of hosting, all legacy admin actions or third-party infrastructure. Existing admin authentication still depends on privately configured deployment secrets; those values were not accessed or changed. Live reporting, actual Google consent traffic and production deployment behavior remain separate rollout checks.

## Undo

Disable `GA4_REPORTS_ENABLED` and restart/redeploy to stop reporting API calls. Remove/set false `GA4_COLLECTION_ENABLED`, rebuild and redeploy to remove collection from new page loads. Already-open pages retain their loaded code until closed or reloaded; a deployment is not an instantaneous stop for every existing tab.

Revert the dedicated GA4 commit, preserving any subsequent edits. It adds three small integration edits (public layout, admin layout, admin navigation) and the analytics modules, route, tests and this document. Do not reset the whole repository. Private verified pre-edit copies were retained locally before editing the original checkout.

The follow-up security commit also updates dependencies and fixes menu/contact effects. Prefer a targeted analytics rollback so the dependency security patches remain in place. If reverting the whole PR merge is necessary, use a normal revert of that merge's first-parent changes, then reapply the dependency patches; do not force-push or reset shared history.

If reporting permission is later granted, revoke only the dedicated identity's Viewer permission and remove its privately managed credentials. Keep the GA4 property and historical data; deleting them is unnecessary for rollback.

## Official references

- [Basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- [Google tag privacy controls and disable flag](https://developers.google.com/tag-platform/security/guides/privacy)
- [GA4 tag configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)
- [Avoid sending personal information](https://support.google.com/analytics/answer/6366371)
- [Realtime reporting](https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-basics)
- [Realtime dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema)
- [Service-account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account)
