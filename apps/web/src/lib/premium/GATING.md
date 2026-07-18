# Premium gating — how it works & the proposed realignment

## Actual architecture (verified)

There is **no server-side / Java feature enum** — premium gating is **client-side
only** today. (An earlier `feature-flags.ts` claimed "the same enum lives in Java";
it was dead code with zero imports and has been removed.)

The single source of truth is **`@fuelyn/core`**:
- `PremiumFeature` — the feature id union.
- `FEATURE_TIER: Record<PremiumFeature, 'free' | 'premium'>` — the gating matrix
  (`billing/subscription.ts`).
- `isFeatureUnlocked(feature, subscription)` — the engine (trial/active → all
  premium; cancelled/past_due → until period end).
- `<PremiumGate feature="…">` (web) wraps UI in an upgrade prompt.

**Currently gated in the UI** (via inline `isFeatureUnlocked`):
- `carbon-offset-buy` → `CarbonOffsetCard`
- `border-crossing-live` → `BorderCrossingCard`

`FEATURE_TIER` marks 10 features premium, but only those 2 are wired. `<PremiumGate>`
exists but isn't wrapped around any surface yet.

## Proposed realignment (competitive report)

Lead premium with the **value-stack** (what no incumbent bundles), not with parity
features. Price is **€1.99/mo** (see `pricing.ts`; Stripe objects via
`scripts/stripe-setup.mjs`).

**Move to FREE** (parity — gating them reads as petty):
- `price-prediction-7d` → free (mehr-tanken/ADAC already forecast for free).
- Keep price alerts free (at least one tier).

**Keep / make PREMIUM (wire these next):**
| Feature | Surface to gate | Wired? |
|---|---|---|
| `border-crossing-live` | BorderCrossingCard | ✅ |
| `carbon-offset-buy` | CarbonOffsetCard | ✅ |
| `multi-vehicle-fleet` | vehicle manager (2nd+ vehicle) | ☐ |
| `csv-export` / `wrapped-pdf` | fuel-log / wrapped export | ☐ |
| `ai-chat-pro` | /ai-chat (unlimited) | ☐ |
| *(new)* effective-price automation, imports (receipt/bank/Spritmonitor) | add to `PremiumFeature` + `FEATURE_TIER`, then gate | ☐ |

## Why the rest isn't wired here

Wrapping currently-free features in a paywall changes free-tier UX and revenue — a
**product decision** that needs sign-off and visual QA (unavailable this session).
The engine is ready; flipping each surface is a one-liner:

```tsx
<PremiumGate feature="multi-vehicle-fleet"><AddVehicle /></PremiumGate>
// or inline:  if (!isFeatureUnlocked('csv-export', subscription)) return <Upsell/>;
```

Checklist when scheduled: (1) set `FEATURE_TIER` (incl. `price-prediction-7d` → free);
(2) add any new `PremiumFeature` ids in core; (3) wrap the surfaces above;
(4) seed the 14-day trial with the highest-pull items; (5) if a hard paywall is
required (not just UI hiding), add **server-side** enforcement in the gateway —
that is the only part that would introduce a real Java change.
