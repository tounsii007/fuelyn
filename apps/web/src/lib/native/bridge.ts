// ============================================================
// NativeBridge — thin abstraction over Capacitor plugins.
//
// The web build never imports @capacitor/* directly — instead it
// goes through this module, which returns no-op fallbacks when
// the runtime is a plain browser. That keeps the web bundle
// free of @capacitor/* code (Capacitor uses dynamic-imports for
// its plugins, so they're not in the dep graph anyway when
// tree-shaken).
//
// On native (iOS / Android shells), `globalThis.Capacitor` is
// injected by the runtime and we forward to the real plugins.
//
// Pure / SSR-safe — uses the global proxy, no top-level imports.
// ============================================================

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => 'ios' | 'android' | 'web';
  Plugins?: {
    Haptics?: { impact: (opts: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void> };
    StatusBar?: { setStyle: (opts: { style: 'DARK' | 'LIGHT' | 'DEFAULT' }) => Promise<void> };
    Share?: { share: (opts: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<unknown> };
    Toast?: { show: (opts: { text: string; duration?: 'short' | 'long' }) => Promise<void> };
    Geolocation?: {
      getCurrentPosition: (opts?: { enableHighAccuracy?: boolean }) => Promise<{ coords: { latitude: number; longitude: number; accuracy: number } }>;
    };
  };
}

function getCapacitor(): CapacitorGlobal | null {
  if (typeof globalThis === 'undefined') return null;
  const cap = (globalThis as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap ?? null;
}

// -----------------------------------------------------------------
// Platform detection
// -----------------------------------------------------------------

export type Platform = 'ios' | 'android' | 'web';

export function getPlatform(): Platform {
  const cap = getCapacitor();
  if (cap?.getPlatform) {
    try { return cap.getPlatform(); } catch { /* fall through */ }
  }
  return 'web';
}

export function isNative(): boolean {
  const cap = getCapacitor();
  if (cap?.isNativePlatform) {
    try { return cap.isNativePlatform(); } catch { /* fall through */ }
  }
  return false;
}

// -----------------------------------------------------------------
// Plugin facades — every method is async + returns a Promise so
// callers don't have to branch on platform. Each gracefully
// degrades to a no-op on web.
// -----------------------------------------------------------------

export async function hapticImpact(style: 'LIGHT' | 'MEDIUM' | 'HEAVY' = 'LIGHT'): Promise<void> {
  const plugin = getCapacitor()?.Plugins?.Haptics;
  if (!plugin) return; // browser → silent no-op
  try { await plugin.impact({ style }); } catch { /* ignore */ }
}

export async function setStatusBarStyle(style: 'DARK' | 'LIGHT' | 'DEFAULT'): Promise<void> {
  const plugin = getCapacitor()?.Plugins?.StatusBar;
  if (!plugin) return;
  try { await plugin.setStyle({ style }); } catch { /* ignore */ }
}

export async function shareNative(opts: {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}): Promise<boolean> {
  const plugin = getCapacitor()?.Plugins?.Share;
  if (plugin) {
    try { await plugin.share(opts); return true; } catch { /* ignore */ }
  }
  // Fallback: Web Share API.
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      });
      return true;
    } catch { /* ignore */ }
  }
  // Last resort: copy URL to clipboard.
  if (opts.url && typeof navigator !== 'undefined' && 'clipboard' in navigator) {
    try {
      await navigator.clipboard.writeText(opts.url);
      return true;
    } catch { /* ignore */ }
  }
  return false;
}

export async function nativeToast(text: string, duration: 'short' | 'long' = 'short'): Promise<void> {
  const plugin = getCapacitor()?.Plugins?.Toast;
  if (!plugin) return;
  try { await plugin.show({ text, duration }); } catch { /* ignore */ }
}

export interface NativeCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * High-accuracy geolocation. Prefers the Capacitor plugin (which
 * uses CoreLocation / FusedLocationProvider) over the browser API.
 */
export async function getNativeLocation(): Promise<NativeCoords | null> {
  const plugin = getCapacitor()?.Plugins?.Geolocation;
  if (plugin) {
    try {
      const pos = await plugin.getCurrentPosition({ enableHighAccuracy: true });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch { /* ignore */ }
  }
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    return new Promise<NativeCoords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }
  return null;
}
