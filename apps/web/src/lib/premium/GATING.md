# Premium gating — proposed realignment (spec)

> Status: **proposal, not yet implemented.** The `FeatureId` enum in
> `feature-flags.ts` is mirrored in the Java gateway (see the note at the top of
> that file). Changing which features are free vs premium therefore requires a
> **coordinated web + backend change** and product sign-off. This document is the
> agreed target so both sides can move in lockstep.

## Why (competitive analysis)

The German fuel-price market anchors paid tiers at **€3.99–4.99 / year** (ADAC is
free). Selling ad-removal or price *forecasting* (mehr-tanken "Flizzi", ADAC
"Tank-Prognose" already do it) will not sustain a subscription. Premium must
monetize **the stack no incumbent bundles** — see the competitive report.

Displayed price is now **€1.99 / month** (annual €19.99, ~16 % off) — see
`pricing.ts`. Positioning: *the cheapest stop, not the cheapest litre.*

## Target tiers

**Free (acquisition — must stay generous):**
- Live map + prices (MTS-K), search, filters, favourites
- Basic best-deal recommendation + reachability
- Single vehicle, price history, cross-device sync

**Premium — the differentiators (value-stack):**
| Capability | Feature id (proposed) | Today |
|---|---|---|
| Effective-price automation (auto drive-cost + loyalty rebate on every station) | `effective-price-auto` | free/partial |
| Import & bookkeeping (receipt OCR, bank-CSV, Spritmonitor) | `imports-pro` | free |
| Multi-vehicle / fleet | `multi-vehicle-fleet` | — |
| Cross-border live comparison | `border-crossing-live` | free |
| Unlimited route stops | `unlimited-route-stops` | in enum |
| AI chat without limit | `ai-chat-pro` | — |
| Wrapped export (PDF) / CSV export | `wrap-export`, `csv-export` | in enum |

**Explicitly NOT premium-gated** (parity features — gating them reads as petty):
price forecast, price alerts (keep at least one free), basic history.

## Implementation checklist (when scheduled)
1. Extend `FeatureId` in `feature-flags.ts` **and** the Java gateway enum together.
2. Move the differentiators above out of the free path; keep basic finding free.
3. Wrap the premium surfaces in `<PremiumGate feature="…">` with an upgrade fallback.
4. Keep the 14-day trial (`TRIAL_FEATURES`) seeded with the highest-pull items
   (effective-price-auto, imports-pro) to drive conversion.
5. Add analytics on gate views → checkout to measure conversion at €1.99.
