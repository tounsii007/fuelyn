// ============================================================
// Capacitor configuration — drives the native iOS / Android
// shell that wraps the Next.js PWA. Generated for Iter V
// (Feature #20: Capacitor / CarPlay wrapper).
//
// To bootstrap the native projects (one-time, requires Xcode /
// Android Studio):
//
//   pnpm --filter @fuelyn/web build
//   pnpm --filter @fuelyn/web cap:add:ios
//   pnpm --filter @fuelyn/web cap:add:android
//   pnpm --filter @fuelyn/web cap:sync
//
// On every web change, `cap:sync` copies the freshly-built
// `out/` (or `.next/server` for SSR) into the native shells.
//
// The webDir below points at Next's static-export folder. For
// SSR deployments, switch the build to `next build` + a thin
// proxy in the wrapper, OR ship the static-export build of
// /map and the PWA manifest only.
// ============================================================

/**
 * Inline CapacitorConfig shape so this file type-checks BEFORE the
 * @capacitor/cli dep is installed (the bootstrap is one-time and
 * happens via `pnpm add -D @capacitor/cli @capacitor/core` when the
 * native shells are first generated). Once the dep is in place,
 * swap the line below for: `import type { CapacitorConfig } from '@capacitor/cli';`
 */
interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    url?: string;
    androidScheme?: string;
    cleartext?: boolean;
    iosScheme?: string;
    hostname?: string;
    allowNavigation?: string[];
  };
  ios?: {
    contentInset?: 'automatic' | 'always' | 'never' | 'scrollableAxes';
    scrollEnabled?: boolean;
    backgroundColor?: string;
  };
  android?: {
    backgroundColor?: string;
    allowMixedContent?: boolean;
  };
  plugins?: Record<string, Record<string, unknown>>;
}

const config: CapacitorConfig = {
  appId: 'com.fuelyn.app',
  appName: 'Fuelyn',
  webDir: 'out',
  bundledWebRuntime: false,

  /**
   * Server config — leave undefined for the static-export path so
   * the bundle ships with the build. Override with NEXT_PUBLIC_BASE
   * to point at the production server when developing against a
   * deployed staging URL.
   */
  server: {
    androidScheme: 'https',
    cleartext: false,
  },

  /**
   * iOS-specific config. CarPlay support is enabled at the
   * Info.plist level after `cap:add:ios` — see ios/App/Info.plist
   * patches in docs/CarPlay.md (added as part of this iter).
   */
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    backgroundColor: '#FFFFFF',
  },

  /**
   * Android-specific config.
   */
  android: {
    backgroundColor: '#FFFFFF',
    allowMixedContent: false,
  },

  /**
   * Plugins we depend on. Versions managed in package.json under
   * @capacitor/* (added with `pnpm add` when bootstrapping native).
   */
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#2575EA',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      // Keep system UI tinted with our brand; lock to dark text on
      // light backgrounds for legibility.
      style: 'DEFAULT',
      backgroundColor: '#FFFFFF',
    },
    Geolocation: {
      // Native geolocation is the right path on phone — saves the
      // browser's permission dialog round-trip.
      permissions: ['fine', 'coarse'],
    },
  },
};

export default config;
