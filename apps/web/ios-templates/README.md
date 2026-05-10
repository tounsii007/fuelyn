# Fuelyn — Native shell bootstrap (iOS / Android)

This folder ships **template** Swift / Kotlin sources that drop into the
Capacitor-generated native shells AFTER you run

```bash
pnpm --filter @fuelyn/web cap:add:ios
pnpm --filter @fuelyn/web cap:add:android
```

We keep the templates HERE (under `apps/web/ios-templates/` and
`apps/web/android-templates/`) rather than committing the full
`ios/` and `android/` directories because the latter contain
machine-generated boilerplate that's noisy in diffs and changes
with every Capacitor release.

## iOS

After `cap:add:ios`:

1. Copy `ios-templates/App/App/CarPlaySceneDelegate.swift` to
   `ios/App/App/CarPlaySceneDelegate.swift`.
2. Merge `ios-templates/App/App/CarPlay-INFO.plist` into
   `ios/App/App/Info.plist` (adds the second
   `CPTemplateApplicationSceneSessionRoleApplication` scene + the
   carplay-maps entitlement requirement).
3. In `ios/App/App.xcodeproj` → Capabilities → enable
   "CarPlay Maps". This also requires Apple Developer team approval
   for the carplay-maps entitlement (request on developer.apple.com).
4. Sign the app with the Pass-Type ID certificate so Iter R / AD
   wallet passes verify on device.

## Android

After `cap:add:android`:

1. Copy `android-templates/app/src/main/java/com/fuelyn/app/auto/FuelynAutoService.kt`
   to the matching path under `android/`.
2. Copy `android-templates/app/src/main/res/xml/automotive_app_desc.xml`
   to `android/app/src/main/res/xml/`.
3. In `android/app/build.gradle`, add the dependency:

   ```gradle
   implementation 'androidx.car.app:app:1.4.0'
   implementation 'androidx.car.app:app-projected:1.4.0'
   ```

4. In `android/app/src/main/AndroidManifest.xml`, register the
   service inside `<application>`:

   ```xml
   <service
     android:name=".auto.FuelynAutoService"
     android:exported="true">
     <intent-filter>
       <action android:name="androidx.car.app.CarAppService" />
       <category android:name="androidx.car.app.category.NAVIGATION" />
     </intent-filter>
   </service>
   <meta-data
     android:name="com.google.android.gms.car.application"
     android:resource="@xml/automotive_app_desc" />
   ```

## Endpoints touched

Both native templates read from `/api/widgets/top-deal` — the same
endpoint the Win11 PWA widget uses (Iter J). One JSON contract,
three surfaces.

## Wallet pass signing

For Iter R / AD pass-signing on real devices, set these env vars
before serving:

| Env var | Description |
|---|---|
| `FUELYN_PKPASS_CERT_PATH` | path to the Pass Type ID cert (PEM) |
| `FUELYN_PKPASS_KEY_PATH` | path to the matching private key (PEM) |
| `FUELYN_PKPASS_KEY_PASSPHRASE` | passphrase if the key is encrypted |
| `FUELYN_PKPASS_WWDR_PATH` | path to the Apple WWDR intermediate (PEM) |

When all four are set, the BFF returns proper signed `.pkpass` bundles
that install directly into Apple Wallet. When any are missing, it
returns the unsigned manifest + JSON preview (Iter R behaviour).
