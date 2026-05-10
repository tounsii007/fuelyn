// ============================================================
// Wallet-Pass Builder
//
// Generates the JSON payloads for Apple Wallet (.pkpass) and
// Google Wallet (Generic Pass) for a single fuel-station "deal"
// — typically the user's favourite station's current cheapest
// price.
//
// The iconic flow on the user's phone:
//
//   Open the pass → "Aral Bahnhofstr. 12 · E10 1.749 €/L"
//                   "1.2 km · open until 22:00"
//                   [QR] → tap to open Fuelyn
//
// What this module DOES:
//   * builds the pass.json (Apple) / GenericObject (Google) shape
//   * emits the manifest.json hash bundle for the .pkpass zip
//   * leaves SIGNING to a future backend service (the Apple
//     pass-type-id certificate + Google service-account JSON
//     don't belong in the client bundle)
//
// What this module DOES NOT do:
//   * sign the manifest (would need the pass-type-id PEM and a
//     CMS detached signature)
//   * zip the .pkpass (the BFF endpoint that serves it can do
//     that with `jszip` if we ever ship it)
//
// Pure / deterministic.
// ============================================================

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------

export interface WalletPassInputs {
  /** Stable id used as the pass serial — typically the station id. */
  stationId: string;
  /** Display name (e.g. "Aral Bahnhofstr. 12"). */
  stationLabel: string;
  /** City line for the secondary field. */
  cityLine?: string;
  /** Fuel grade for the headline ("E10" / "E5" / "Diesel"). */
  fuelLabel: string;
  /** Price in €/L, formatted "1,749". */
  priceEurPerL: string;
  /** Distance from the user's current location, e.g. "1.2 km". Optional. */
  distanceLabel?: string;
  /** Locale (used for the language-tag on the pass payload). */
  locale?: string;
  /** Deep-link URL the wallet should open when tapped. */
  deepLink: string;
  /** Pass-type-id, configured at the Apple Developer portal. */
  passTypeIdentifier?: string;
  /** Apple Developer Team identifier. */
  teamIdentifier?: string;
  /** Brand colour for the pass background (CSS hex). */
  backgroundColorHex?: string;
}

export interface ApplePassJson {
  formatVersion: 1;
  passTypeIdentifier: string;
  teamIdentifier: string;
  organizationName: string;
  serialNumber: string;
  description: string;
  /** Pass label shown in the lock-screen layout. */
  logoText: string;
  foregroundColor: string;
  backgroundColor: string;
  labelColor: string;
  generic: {
    primaryFields: Array<{ key: string; label: string; value: string }>;
    secondaryFields: Array<{ key: string; label: string; value: string }>;
    auxiliaryFields: Array<{ key: string; label: string; value: string }>;
    backFields: Array<{ key: string; label: string; value: string; attributedValue?: string }>;
  };
  barcode: { format: string; message: string; messageEncoding: string };
}

export interface GooglePassJson {
  /**
   * Google Wallet GenericObject shape — the canonical envelope for
   * a "save to Google Wallet" generic pass. The signed JWT that
   * actually lands the pass on the device is built by the backend
   * using its Google service-account key.
   */
  id: string;
  classId: string;
  state: 'ACTIVE';
  cardTitle: { defaultValue: { language: string; value: string } };
  subheader: { defaultValue: { language: string; value: string } };
  header: { defaultValue: { language: string; value: string } };
  textModulesData: Array<{ id: string; header: string; body: string }>;
  barcode: { type: 'QR_CODE'; value: string };
  hexBackgroundColor: string;
  linksModuleData: { uris: Array<{ uri: string; description: string; id: string }> };
}

export interface WalletPassResult {
  apple: ApplePassJson;
  google: GooglePassJson;
}

// -----------------------------------------------------------------
// Builders
// -----------------------------------------------------------------

const DEFAULT_BG = '#2575EA'; // Fuelyn brand
const DEFAULT_FG = '#FFFFFF';

export function buildWalletPass(inputs: WalletPassInputs): WalletPassResult {
  const locale = (inputs.locale ?? 'de').slice(0, 2);
  const bg = inputs.backgroundColorHex ?? DEFAULT_BG;
  const apple = buildApplePass(inputs, bg, locale);
  const google = buildGooglePass(inputs, bg, locale);
  return { apple, google };
}

function buildApplePass(
  i: WalletPassInputs,
  bg: string,
  _locale: string,
): ApplePassJson {
  return {
    formatVersion: 1,
    passTypeIdentifier: i.passTypeIdentifier ?? 'pass.com.fuelyn.deal',
    teamIdentifier: i.teamIdentifier ?? 'TEAMID0000',
    organizationName: 'Fuelyn',
    serialNumber: `fuelyn-${i.stationId}-${Date.now()}`,
    description: `${i.stationLabel} · ${i.fuelLabel}`,
    logoText: 'Fuelyn',
    foregroundColor: rgbCss(DEFAULT_FG),
    backgroundColor: rgbCss(bg),
    labelColor: rgbCss(DEFAULT_FG),
    generic: {
      primaryFields: [
        { key: 'price', label: i.fuelLabel, value: `${i.priceEurPerL} €/L` },
      ],
      secondaryFields: [
        { key: 'station', label: 'Tankstelle', value: i.stationLabel },
      ],
      auxiliaryFields: [
        ...(i.distanceLabel
          ? [{ key: 'distance', label: 'Entfernung', value: i.distanceLabel }]
          : []),
        ...(i.cityLine
          ? [{ key: 'city', label: 'Ort', value: i.cityLine }]
          : []),
      ],
      backFields: [
        { key: 'link', label: 'Open in Fuelyn', value: i.deepLink },
        {
          key: 'note',
          label: 'Hinweis',
          value: 'Preis-Snapshot — kann sich am Display unterscheiden.',
        },
      ],
    },
    barcode: {
      format: 'PKBarcodeFormatQR',
      message: i.deepLink,
      messageEncoding: 'iso-8859-1',
    },
  };
}

function buildGooglePass(
  i: WalletPassInputs,
  bg: string,
  locale: string,
): GooglePassJson {
  return {
    id: `fuelyn.${i.stationId}.${Date.now()}`,
    classId: 'fuelyn.deal',
    state: 'ACTIVE',
    cardTitle: { defaultValue: { language: locale, value: 'Fuelyn · Top Deal' } },
    subheader: {
      defaultValue: { language: locale, value: i.stationLabel },
    },
    header: {
      defaultValue: { language: locale, value: `${i.priceEurPerL} €/L` },
    },
    textModulesData: [
      ...(i.cityLine
        ? [{ id: 'city', header: 'Ort', body: i.cityLine }]
        : []),
      ...(i.distanceLabel
        ? [{ id: 'distance', header: 'Entfernung', body: i.distanceLabel }]
        : []),
      { id: 'fuel', header: 'Kraftstoff', body: i.fuelLabel },
    ],
    barcode: { type: 'QR_CODE', value: i.deepLink },
    hexBackgroundColor: bg,
    linksModuleData: {
      uris: [{ uri: i.deepLink, description: 'In Fuelyn öffnen', id: 'link' }],
    },
  };
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

/** "#2575EA" → "rgb(37, 117, 234)" — Apple Wallet's required colour syntax. */
export function rgbCss(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgb(37, 117, 234)';
  const n = parseInt(m[1]!, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/**
 * Produce the manifest.json content (file → SHA-1 hash) that an
 * Apple .pkpass zip must include. The caller adds the additional
 * image assets and SHA-1's their content. We expose a helper so
 * the BFF doesn't have to hand-roll the loop.
 *
 * For a stub-build (no signing), the manifest is still valid —
 * just the resulting .pkpass won't pass on-device verification
 * because the signature.bin isn't present.
 */
export function buildAppleManifest(
  files: ReadonlyArray<{ name: string; sha1: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of files) out[f.name] = f.sha1;
  return out;
}
