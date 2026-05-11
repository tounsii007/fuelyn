# Fuelyn — Roadmap

> Source of truth for what we're building, in what order, and why.
> Read this before opening a feature PR.
> Companion to [FUELYN.md](./FUELYN.md) (brand + design system)
> and [ARCHITECTURE.md](./ARCHITECTURE.md) (system topology).

**Currency:** Phase 0 ✅ done · Phase 1 ⏳ next

---

## How to read this document

Each phase has the same six fields:

| Field | What it means |
|---|---|
| **Goal** | What we're trying to make people *feel* and *do* |
| **North-star metric** | The one number we'd hold ourselves accountable to |
| **Deliverables** | Concrete components, endpoints, configs — each with a spec |
| **Technical approach** | How we'd build each deliverable; chosen libraries, contracts |
| **Acceptance criteria** | Definition of done — what we test against |
| **Risks & open questions** | Things that could derail us; calls we haven't made yet |

A phase is **complete** only when:
1. all deliverables are merged behind feature flags or default-on
2. tests cover the new surface (TS unit / Java unit / integration)
3. perf budget (page-load, bundle, re-render) is unchanged or better
4. design tokens are honored (no hardcoded colors / shadows)
5. roadmap entry is checked off in this file with the merge commit hash

---

# Phase 0 — Foundation ✅ DONE

## Goal

Establish the brand, design system, and core experience scaffolding
so every later phase plugs in cleanly.

## North-star metric

Every interactive element on the home screen feels intentional —
no orphan styles, no "obvious template" smell. Subjective but
testable: ten random screens, ten "looks polished" votes.

## Deliverables — what landed

- Brand: TankPilot → Fuelyn rename across **all 11 layers**
  (Java packages, Maven IDs, npm packages, CSS classes, compose
  project name, container/image names, hostnames, Kafka topics,
  Postgres DB, localStorage keys, Spring config namespace, doc
  files). See commit `3c2b558`.
- New design tokens (`apps/web/src/styles/tokens.css`):
    - cinematic dark navy `oklch(0.13 0.025 252)`
    - electric brand ramp with high-chroma mid stops
    - cyan-300..600 for live indicators
    - violet-300..600 reserved for AI-emitted UI
    - 4 glow shadows + cinematic shadow
- Splash screen: stacked-radial backdrop, drop+lightning glyph,
  spaced-uppercase eyebrow.
- BestDealCard premium hero (`intelligence/BestDealCard.tsx`).
- Tiered AI pipeline (cache → heuristic → Ollama → OpenAI).
- Multi-signal advisor with 8 independent signals + transparent
  breakdown.
- Real-time Kafka stream (Redpanda + 2 consumer groups).
- Address search with high-accuracy GPS + reverse-geocode at
  zoom 18 + dedup-aware history.
- Tiered AI orchestrator with 8 tests, 30 ai-service tests total.
- 113 backend + 72 web tests, all green.
- 4 locales (DE / EN-UK / EN-US / FR) with professional translations.
- 6-variant background picker with CSS-variable-based mesh.
- Custom PopoverSelect (replaces brittle native `<select>`).
- Top-bar grouped into Search · Filter · View · Personal · Settings.
- More-menu sectioned into Verwalten / Analysieren / Mehr.
- Geolocate button with 4-state machine (idle / locating / success / denied).

## Technical approach (what we chose, why)

| Decision | Why |
|---|---|
| OKLCH over HSL | perceptually-uniform; same chroma feels equally vibrant across hues |
| `*.localhost` hostname | RFC 6761, immune to DoH; no hosts-file edits |
| Custom PopoverSelect | OS paints native `<option>` chrome → unstylable, illegible on dark glass |
| Tiered AI (heuristic → Ollama → OpenAI) | guarantees correctness; LLM can't hallucinate the verdict |
| Kafka via Redpanda | ~256 MB RAM idle vs Apache ~1 GB, same wire protocol |
| CSS variables for mesh backgrounds | eliminates selector-specificity ambiguity |
| Zoom 18 reverse-geocode + high-accuracy GPS | street-level precision impossible at default zoom 14 |

---

# Phase 1 — Premium polish ⏳ NEXT

## Goal

Make the home screen *feel* like a Tesla / Linear / Apple Maps
flagship moment. Every glance should produce one premium-perception
trigger: a glow, a fluid count-up, a sparkline that moves.
This phase is mostly **front-end polish + 1 small AI surface**.

## North-star metric

**Time-to-first-wow** — from page-load to the user seeing their
first animated, intelligent, brand-marked element. Target: <600 ms
on warm cache. Today: ~1.2 s (we're loading the static
BestDealCard but no live signals).

## Deliverables

### 1.1 PricePredictionCard

A second hero card just below `BestDealCard` that predicts the
next price drop window for the user's preferred fuel type at
their nearest 3 stations.

**UX**

```
┌──────────────────────────────────────────┐
│ ✨ AI VORHERSAGE                  ↗ 92%  │  ← violet eyebrow + confidence
│                                           │
│ Warte 2 h 14 min                          │  ← big animated countdown
│ und spare ≈ 6,2 ct/L                      │  ← electric-green saving
│                                           │
│  ▁▂▂▃▅▇▆▄▂▁  Sparkline (24 h)             │  ← inline mini-chart
│                                           │
│ Begründung: Trend fällt seit 18 h         │
│  · Bayesian-Prior: Tue 19 h ≈ −4 ct       │  ← per-signal breakdown chips
│  · Spread weitend (12 ct → 18 ct)         │
└──────────────────────────────────────────┘
```

**Components to build**

- `intelligence/PricePredictionCard.tsx`
- `ui/AnimatedCounter.tsx` — spring-eased number tween, supports
  duration formats (`hh:mm`, `mm:ss`, `±N ct/L`)
- `ui/Sparkline.tsx` — 24-h price chart inline; accepts an array
  of `{ts, price}` and renders a 56×16 svg with brand-blue stroke
  and a soft glow

**Backend wiring**

- New `GET /api/v1/ai/forecast` endpoint in `ai-service`,
  delegating to the existing `StationForecaster` helper.
- Returns `{ stations: [{ id, currentPrice, p10, p50, p90, ts[] }] }`
- Default cache window 5 min; per-station + per-fuel-type bucket.
- Response shape stays under 4 KB JSON (suitable for SSE push too).

**Acceptance**

- `PricePredictionCard` renders within 200 ms of having station data.
- Sparkline animates the path drawing in over 600 ms with ease-out.
- Saving figure tweens via spring-eased `AnimatedCounter`.
- A11y: countdown is announced via `aria-live="polite"`, sparkline
  has `<title>` and `aria-label` summary.
- Reduced-motion suppresses both animations.
- Tests: `forecast` endpoint round-trip + `Sparkline` snapshot
  + `AnimatedCounter` covers tween-clamp + reduce-motion bypass.

### 1.2 Glow markers on the map

Today every station marker is a flat circle. Phase 1 introduces
a **glow halo** for the top-1 station, a **pulse** for live updates,
and **subtle outline** for closed stations.

**Implementation**

- New `map/GlowMarker.tsx` Leaflet `L.divIcon` factory.
- Top-1: 16 px violet→cyan radial halo, 1 s ease-in-out pulse.
- Active live update (within last 60 s): one-shot 800 ms scale
  pulse on the affected marker (driven by the SSE feed).
- Closed: gray fill, 50 % opacity, no halo.

**Performance budget**

- Marker count ≤ 200 visible; DOM size impact ≤ 10 % of map div.
- Pulse uses CSS `@keyframes`, no JS animation loop.
- `transform: translateZ(0)` to keep markers off the main paint
  layer.

### 1.3 Magnetic hover on top-bar icons

Each icon button slides 1-2 px toward the cursor with a
spring tween while inside its hit-area, then snaps back on
exit. Borrowed from Linear / Vercel buttons.

**Implementation**

- Pure CSS via custom property updates inside an `onPointerMove`
  handler; only when `:hover` is active and `prefers-reduced-motion`
  is `no-preference`.
- One shared 6-line hook `useMagneticHover()`.
- Apply to `<IconButton>`, `<IconLink>` (already centralised).

### 1.4 Sparkline component

Already mentioned in 1.1 — call it out separately because
it's reused elsewhere in Phase 2.

**API**

```tsx
<Sparkline
  data={priceHistory}     // {ts: ISO, value: number}[]
  width={120} height={32}
  glow="brand"            // 'brand' | 'cyan' | 'violet' | 'success'
  ariaLabel="24-Stunden-Trend" />
```

### 1.5 AnimatedCounter component

```tsx
<AnimatedCounter
  value={6.2}
  format="ct"             // 'ct' | 'eur' | 'duration' | 'percent' | 'integer'
  duration={650}          // ms
  className="text-emerald-300 tabular-nums" />
```

Handles negative deltas, sign coloring, fixed-decimals, reduce-motion.

### 1.6 Mobile bottom-sheet drag interactions

Today the station detail panel slides up but doesn't drag.
Phase 1 adds three snap points (peek 96 px / half / full),
swipe-down dismiss, momentum.

**Library decision**

- **Adopt `framer-motion`** (currently CSS-only) — its `useDrag`
  + `useSpring` is the only way to get native-quality momentum
  in a reasonable amount of code.
- Bundle cost: ~40 KB gzipped — acceptable, gated behind dynamic
  import on the home route.
- Other phases (shared-layout transitions, story-player choreography)
  benefit too.

### 1.7 AnomalyBadge

A neon-orange chip that overlays a station marker when its
current price is > 1.5 σ above the local market mean OR
< 1.5 σ below. Powered by `BrandBaseline.cheapestBrandZ` we
already compute server-side.

**UX**

- Above-mean: amber chip "↑ Ungewöhnlich teuer"
- Below-mean: emerald chip "↓ Ungewöhnlich günstig"
- Hover: shows the actual sigma + percentile

## Risks & open questions

- **Sparkline performance:** rendering 50 sparklines in a
  virtualised list at 60 fps. Mitigation: render to a single
  SVG sprite sheet; reuse paths with `<use>`.
- **Framer-motion bundle size:** tree-shake critical only;
  measure before/after Lighthouse.
- **Magnetic hover on touch devices:** disable entirely (we
  only enable when `pointer: fine`).

## Phase 1 estimated effort

| Block | Effort |
|---|---|
| 1.1 PricePredictionCard + AnimatedCounter + Sparkline | 1.5 days |
| 1.2 Glow markers | 0.5 day |
| 1.3 Magnetic hover | 0.25 day |
| 1.4 + 1.5 Sparkline / Counter polish | (covered above) |
| 1.6 Mobile bottom-sheet | 1 day |
| 1.7 AnomalyBadge | 0.5 day |
| Tests + a11y review | 0.5 day |
| **Total** | **~4 days** |

---

# Phase 2 — Intelligence widening

## Goal

Move from "shows a recommendation" to "feels like a co-pilot".
The user can ask, the system can answer, anomalies surface
automatically, and loyalty programs lower the effective price
without manual fiddling.

## North-star metric

**Conversion to action** — % of sessions where the user clicks
"Navigate to best deal" within 60 s of opening the app. Today
unmeasured; target ≥ 35 %.

## Deliverables

### 2.1 AIChatDrawer

A full-height drawer (right-side desktop, bottom-sheet mobile)
that wraps `ai-service`. Question prompts:

- "Wo soll ich heute tanken?"
- "Wann ist diese Woche der beste Moment für Diesel?"
- "Welche Aral-Tankstelle ist konstant am günstigsten?"
- "Lohnt sich der Umweg zur HEM in Marburg?"

**Architecture**

- New endpoint `POST /api/v1/ai/chat` returns NDJSON-streamed
  tokens (so the user sees the reply unfold).
- Server hands the user prompt to **the same Ollama backend**
  used by the advisor enricher, but with a different system
  prompt that scopes to "you are a German fuel advisor;
  always cite a specific station; never invent prices."
- Conversation state lives **client-side only** in
  `useAppStore.chatThread`. No server-side history.
- Rate-limit: 10 requests / minute / API-key on the gateway.
- Hallucination guard: every numeric the model emits must be
  cross-checked against the `recommendations[]` payload we
  ship in the request. If the model invents a price, we
  rewrite it to "die Preise lagen zwischen X und Y €".

**UX**

- Drawer can be opened with `⌘ + /` (also discoverable via the
  command palette).
- Predefined "starter prompt" chips at the top.
- Markdown rendered with `react-markdown`; scrollable.
- Each AI message has a violet halo and a "✦ Fuelyn AI" badge.

### 2.2 Heatmap overlay

Show "cheap-zones" on the map. Aggregate the last 24 h of price
snapshots from `price_snapshots` per geohash bucket (precision 6,
~1.2 km per cell), normalize to 0..1, render via `leaflet.heat`.

**Backend**

- New endpoint `GET /api/v1/prices/heatmap?bbox=...` in
  `price-service`.
- Returns `[{lat, lng, weight}]`. Caching 60 s in Caffeine.
- Pre-aggregated nightly job materializes a `price_heatmap`
  table to keep query <50 ms.

**UX**

- Toggle in the top-bar's "View" group.
- Color stops: cheap → emerald → amber → red.
- Alpha capped at 0.45 so markers stay legible.
- Legend appears as a small inline gradient bar in the corner.

### 2.3 Per-station 24 h forecast

`StationForecaster` already exists in `ai-service`. We expose
its quantiles (p10 / p50 / p90) at the station-detail page.

**UX**

- New "Vorhersage" tab in `/station/[id]` page.
- Chart: filled-area p10..p90 in muted brand-blue, p50 line in
  bright cyan, current price marked with a violet cross.
- Y-axis tabular-nums, x-axis 24-hour time labels.
- "Wahrscheinlichkeit unter X €" widget that lets the user pick
  a target price and shows the predicted probability.

### 2.4 Loyalty bonus on BestDealCard

`AffiliateRebate` already maps brand → ct/L for ADAC, Aral
Comfort, HEM Card etc. Surface it.

**UX**

- New "Programme" section in `/vehicle` page. User opts into
  membership (boolean per program).
- BestDealCard now applies the rebate to the listed price and
  shows the breakdown:
  ```
  Listenpreis      1,799 €
  ADAC -1 ct       1,789 €  ← brand-blue
  Effektivpreis    1,789 €
  ```
- Effective price drives the "best deal" ranking (already does
  in the heuristic).

### 2.5 Smart alerts dashboard

The `/alerts` page becomes more than a list. Add:

- Geo-fenced alert visualization (mini map per fence)
- "Last fired" timestamp and what happened
- Aggregated "saved this month" counter, animated via
  `AnimatedCounter`

## Risks & open questions

- **AI cost ceiling:** chat is more expensive than advisor
  enrichment. Default backend: Ollama (free, local). OpenAI
  only on opt-in upgrade.
- **Heatmap aggregation cost:** computing nightly geohash
  buckets across N million snapshots could be heavy. Start
  with last 7 days only; profile.
- **Hallucination in chat:** even with cross-checks, free-form
  Q&A can mislead users about fuel prices. Ship behind a
  "Beta" badge for the first 4 weeks.

## Phase 2 estimated effort: ~7 days

---

# Phase 3 — Mobile-native feel

## Goal

The web PWA feels like a native app. PWA install prompt, offline
shell, web-push notifications for price-drop alerts, voice
search via Web Speech API. By the end of this phase a user on
their phone can install Fuelyn from the browser, get push
notifications when prices drop near their geo-fences, and
tap the mic to ask "wo am günstigsten heute?".

## North-star metric

**PWA install rate** — % of mobile users who add Fuelyn to
their home screen within 7 days. Industry baseline 2-5 %.
Target ≥ 8 %.

## Deliverables

### 3.1 PWA install + offline shell

- Service Worker promoted from kill-switch to actual cache.
- Strategy: stale-while-revalidate for HTML/CSS/JS,
  network-first for API.
- App shell precached: AppShell + BestDealCard + last 5
  searched stations.
- Web App Manifest: maskable icons, theme color, display
  standalone.
- "Install Fuelyn" prompt 4 s after second session, dismissible
  permanently with `localStorage.setItem('fuelyn:pwa-prompt-dismissed', '1')`.

### 3.2 Web Push for price alerts

Connect the existing `fuelyn.alerts.v1` Kafka consumer to
the Web Push API.

**Architecture**

- New `notify-service` (Node + `web-push` library) that:
    - holds a VAPID key-pair (rotating annually)
    - subscribes to `fuelyn.alerts.v1`
    - matches each alert against subscribed users' geo-fences
      and price thresholds (Postgres table `push_subscriptions`)
    - sends payload via Web Push (dedup'd per user/event)
- Frontend: subscription request after the first geo-fence is
  set; permission prompt explains why.

**Acceptance**

- Subscribing twice doesn't duplicate.
- Unsubscribing removes the row server-side.
- Payload shows up as a system notification within 3 s of
  the Kafka event.

### 3.3 Voice search

`AddressSearch` gains a microphone button. Web Speech API
(`webkitSpeechRecognition` / `SpeechRecognition`).

- Toggle by holding the mic 200 ms (avoid accidental presses)
- de-DE locale by default, follows app language
- Final transcript fills the input; user confirms
- Falls back to text if API unavailable

### 3.4 Native bottom-sheet feel

Phase 1 added basic drag. Phase 3 polishes:

- Velocity-based snap (flick down → close)
- Backdrop blur darkens with sheet height
- Status-bar tint matches sheet content
- Share sheet target: "Send to me later", "Share with friend"

### 3.5 Service worker prefetch

When the user pans the map, prefetch the next zoom-tile ring
(z+1 around viewport center). Reduces tile pop-in on zoom.

## Risks & open questions

- **iOS PWA limitations:** push only since iOS 16.4, requires
  user to first add to home screen. Handle the (still common)
  iOS-without-PWA case gracefully.
- **VAPID key management:** rotation needs a migration plan for
  existing subscribers (they need to re-subscribe after rotation).
- **Voice transcription accuracy:** German addresses can be
  long ("Bahnhofstraße 12, 35037 Marburg"). Tune the silence
  timeout to 2 s.

## Phase 3 estimated effort: ~6 days

---

# Phase 4 — Production readiness

## Goal

Make Fuelyn deployable, observable, and abuse-resistant on a
real public domain. Replace dev tooling with production-grade
equivalents.

## North-star metric

**99.9 % monthly uptime** measured by an external probe
(UptimeRobot / Better Stack) hitting `/actuator/health` on the
gateway every 60 s. Equivalent to ≤ 43 min/month down.

## Deliverables

### 4.1 Real Let's Encrypt cert

Replace Caddy `tls internal` with `tls user@example.com`.
Requires a real public domain (we **don't** own `fuelyn.de`,
so pick a different one OR get the domain).

**Decision required from owner:**
- Buy `fuelyn.app` (~50 €/year) or `fuelyn.io` (~80 €/year)
- DNS: A/AAAA → public server IP
- Caddy auto-acquires Let's Encrypt cert; no Kaspersky issue
  thanks to the global trust chain

### 4.2 Public deployment recipe

- Hetzner Cloud CX21 (~ €4/month, 2 vCPU 4 GB) for app + Postgres
- Hetzner CX31 (~ €8/month, 8 GB) for Ollama 7B
- Caddy on host, Docker network internal-only
- `docker compose -f docker-compose.prod.yml` overlay
  (no host port leaks, mgmt actuators on `127.0.0.1`)
- Continuous deployment: GitHub Actions builds on `main`,
  pushes images to GHCR, SSHs into the box and runs
  `docker compose pull && up -d`

### 4.3 Observability stack

- **Sentry** for frontend errors (free tier 5 K events/month)
- **Grafana Cloud** free tier for backend metrics
  (Prometheus scrape `/actuator/prometheus`)
- **Better Stack** for log aggregation (free tier 1 GB/month)
- **OTel** trace export already wired — point at Grafana Tempo

### 4.4 Analytics service

New `analytics-service` (Node + ClickHouse) consumes:

- `fuelyn.advisor.v1` (regret samples — already produced)
- New `fuelyn.user.v1` (UI events — clicks, searches, time-on-screen)
- New `fuelyn.session.v1` (session start/end, device info)

ClickHouse stores 12 months. Powers `/wrapped` per-user reports
and aggregate dashboards (top brands, hottest geo-buckets).

### 4.5 A/B framework on advisor weights

`RegretLogger` already records every advisor verdict + breakdown.
Phase 4 closes the loop:

- Nightly job: read last 24 h regret events, group by advisor
  weight version, compute mean regret per group.
- If a candidate weight set has ≥ 5 % lower mean regret than the
  current default with p < 0.05, auto-promote.
- Config flag `fuelyn.ai.weights-version` selects one of
  several `WeightsProfile` objects.

### 4.6 Rate-limit / abuse protection

- Resilience4j RateLimiter on every `api/v1/**` route, keyed
  by `X-API-Key`. Default: 60 req/min.
- Nominatim BFF proxy: 1 req / 250 ms / IP enforced server-side
  (Nominatim's own rate limit).
- CAPTCHA on `/api/v1/feedback` if implemented (Phase 4.7+).

## Risks & open questions

- **Domain availability:** `fuelyn.app` may already be taken.
  Backup names: `fuelyn.eu`, `fuelyn.global`, `getfuelyn.com`.
- **Hetzner location:** EU data center for GDPR. Default to
  Falkenstein (Germany).
- **Cost ceiling:** keep fixed monthly cost ≤ €15 until first
  real users. Scale to managed Postgres only if traffic warrants.

## Phase 4 estimated effort: ~5 days

---

# Phase 5 — Native mobile

## Goal

A real iOS / Android app (not a PWA) sharing logic with web.
Live Activities on iOS, Android Auto integration, and a fleet/B2B
dashboard for businesses managing 5+ vehicles.

## North-star metric

**App Store rating ≥ 4.5** with ≥ 100 reviews within 6 months
of launch.

## Deliverables

### 5.1 React Native client

- Expo 55 already in `apps/mobile/` as a stub.
- Reuses **all of `@fuelyn/core`** (types, validation, engine,
  i18n, Wrapped algorithm).
- Native modules: `react-native-maps`, `expo-location`,
  `react-native-mmkv` (instead of localStorage).

### 5.2 iOS Live Activities

Real-time price-drop notifications appear in the Dynamic Island
+ Lock Screen during navigation:

```
🔋 Fuel up at Aral
    1.749 €/L · 2 km · save 6 ct/L
```

Powered by ActivityKit + Push Notifications routing through
the same `notify-service` from Phase 3.

### 5.3 Android Auto / CarPlay integration

- Templated "best 3 stations" list rendered in car HUD.
- Voice-friendly: "Hey Siri, ask Fuelyn where to refuel"
  (Apple Shortcuts).
- Hands-free re-route to selected station.

### 5.4 Fleet / B2B dashboard

A separate web app (`apps/fleet/`) for businesses:

- Per-vehicle consumption + cost dashboard
- Approved-station whitelist (cost control)
- Driver leaderboards (efficiency rankings)
- Monthly invoice export (CSV / Datev format)

### 5.5 Multi-region expansion

- Austria + Switzerland (different fuel API, AT: e-control.at)
- Italy (osservaprezzi.mise.gov.it)
- Per-region pricing data adapter under
  `packages/core/src/services/adapters/`.

## Risks & open questions

- **App store review delays:** budget 2 weeks for first iOS
  submission, 1 week for Android.
- **Live Activities ROI:** Apple's API is iOS-16.4+ only;
  ~75 % adoption today. Worth the cost?
- **B2B sales motion:** Fuelyn is consumer-first. The fleet
  dashboard would need a separate go-to-market.

## Phase 5 estimated effort: ~3 weeks (vs days; this phase
is significantly larger because it spans two new platforms).

---

# Cross-phase concerns

## Performance budget (continuous)

| Metric | Phase 0 baseline | Phase 4 target |
|---|---|---|
| FCP (warm) | 0.8 s | < 0.6 s |
| LCP (warm) | 1.4 s | < 1.0 s |
| Bundle (web entry) | 220 KB gz | < 200 KB gz |
| ai-service p99 | 80 ms | < 60 ms |
| price-service p99 | 90 ms | < 70 ms |

If any phase regresses these, **block the merge** until
restored.

## Test coverage targets

| Surface | Today | Phase 5 target |
|---|---|---|
| Backend (JUnit 5) | 113 tests | 250+ tests |
| Web (Vitest) | 72 tests | 200+ tests |
| Visual regression (Playwright) | 0 | 30+ snapshots |
| E2E (Playwright) | 0 | 15+ scenarios |

## Decision-log discipline

Every phase ends with a "decisions" appendix in this file:
what we chose, what we rejected, and why. Future-you (or
future-team-member) shouldn't have to re-litigate the same
trade-offs. See [FUELYN.md §12](./FUELYN.md#12-decision-log).

---

# Phase ordering rules

1. **Phase 1 must complete fully before Phase 2 starts.**
   Polish first, intelligence second; users notice polish more.
2. **Phase 4 can interleave with Phase 2/3** if a deployment
   need arises (e.g. real users). The four production items
   are independently shippable.
3. **Phase 5 should NOT start until Phase 4.1 (real domain
   + LE cert) ships.** A native app pointing at
   `fuelyn.localhost` is not a thing.

---

# Appendix — How to add a new feature mid-phase

1. Open this file. Find the matching phase.
2. Add the feature under "Deliverables" with the same six
   sub-fields as the existing entries (UX sketch · components
   · backend · acceptance · risks · effort).
3. Open a tracking issue with the `[ROADMAP]` prefix and link
   the section anchor.
4. When merged, check the box in this file and add the commit
   hash next to the deliverable.

If the feature doesn't fit any existing phase, create a new
phase 5.x or 6 with the same template — but expect pushback;
phase scope-creep is the #1 way premium products turn into
average products.

---

*Document owner: the team. Last reviewed by Claude on Phase 0 completion.
Next review: at Phase 1 kickoff.*
