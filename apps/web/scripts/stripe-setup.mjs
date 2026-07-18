// ============================================================
// Stripe products + prices setup (idempotent).
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs --dry-run
//
// Creates (or reuses) the "Fuelyn Premium" product and two recurring
// prices with the STABLE lookup keys the app resolves at checkout:
//   • fuelyn-monthly → €1.99 / month
//   • fuelyn-annual  → €19.99 / year
//
// Amounts mirror src/lib/premium/pricing.ts — keep them in sync.
// Idempotent: re-running reuses the product and skips prices whose
// lookup_key already points at a matching amount/interval; otherwise
// it creates the price and transfers the lookup_key onto it.
// ============================================================

const KEY = process.env.STRIPE_SECRET_KEY;
const DRY = process.argv.includes('--dry-run');
if (!KEY) {
  console.error('STRIPE_SECRET_KEY is required.');
  process.exit(1);
}

const PRODUCT_TAG = 'fuelyn-premium'; // stored in product.metadata.app_id
const PRICES = [
  { lookup_key: 'fuelyn-monthly', unit_amount: 199, interval: 'month', nickname: 'Fuelyn Premium — Monthly' },
  { lookup_key: 'fuelyn-annual', unit_amount: 1999, interval: 'year', nickname: 'Fuelyn Premium — Annual' },
];
const CURRENCY = 'eur';

async function stripe(method, path, params) {
  const opts = { method, headers: { Authorization: `Bearer ${KEY}` } };
  if (params) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) body.set(k, String(v));
    opts.body = body.toString();
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

async function ensureProduct() {
  const search = await stripe('GET', `/products/search?query=${encodeURIComponent(`metadata['app_id']:'${PRODUCT_TAG}'`)}`);
  if (search.data?.[0]) {
    console.log(`• product reused: ${search.data[0].id}`);
    return search.data[0].id;
  }
  if (DRY) { console.log('• [dry-run] would create product "Fuelyn Premium"'); return 'prod_DRYRUN'; }
  const p = await stripe('POST', '/products', {
    name: 'Fuelyn Premium',
    'metadata[app_id]': PRODUCT_TAG,
    description: 'Fuelyn Premium — effective-price automation, imports, multi-vehicle, cross-border.',
  });
  console.log(`• product created: ${p.id}`);
  return p.id;
}

async function ensurePrice(productId, spec) {
  const found = await stripe('GET', `/prices?active=true&lookup_keys[]=${encodeURIComponent(spec.lookup_key)}`);
  const existing = found.data?.[0];
  if (existing && existing.unit_amount === spec.unit_amount && existing.recurring?.interval === spec.interval && existing.currency === CURRENCY) {
    console.log(`• price OK: ${spec.lookup_key} = ${(spec.unit_amount / 100).toFixed(2)} ${CURRENCY}/${spec.interval} (${existing.id})`);
    return existing.id;
  }
  if (DRY) { console.log(`• [dry-run] would create price ${spec.lookup_key} = ${(spec.unit_amount / 100).toFixed(2)} ${CURRENCY}/${spec.interval}`); return 'price_DRYRUN'; }
  const created = await stripe('POST', '/prices', {
    product: productId,
    currency: CURRENCY,
    unit_amount: spec.unit_amount,
    'recurring[interval]': spec.interval,
    lookup_key: spec.lookup_key,
    transfer_lookup_key: true, // move the key off any older price
    nickname: spec.nickname,
  });
  console.log(`• price created: ${spec.lookup_key} → ${created.id}`);
  return created.id;
}

const productId = await ensureProduct();
for (const spec of PRICES) await ensurePrice(productId, spec);
console.log(DRY ? '\nDry run complete — no changes made.' : '\nDone. Checkout resolves these lookup keys at request time.');
