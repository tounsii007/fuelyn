# @fuelyn/mobile — Status

**Aktueller Stand:** Stub / Skeleton. Nicht produktionsreif.

| Screen | Status |
|--------|--------|
| `HomeScreen` | ⚠️ Minimal (~78 Zeilen) — Karte + Stationsliste, keine Empfehlungslogik |
| `FavoritesScreen` | 🚧 Coming-Soon-Placeholder |
| `SettingsScreen` | 🚧 Coming-Soon-Placeholder |
| `StationDetailScreen` | 🚧 Coming-Soon-Placeholder |
| `VehicleScreen` | 🚧 Coming-Soon-Placeholder |

## Was funktioniert
- Expo 55 / React Native 0.85 Boot-Stack
- React Navigation v7 (Bottom-Tabs + Native Stack)
- `@fuelyn/core` Imports (Domain-Typen, Engine)

## Was fehlt
- Vollständige Implementation aller Sekundär-Screens
- Anbindung an Web-BFF / Gateway
- Auth-Flow
- Native Push-Notifications
- Offline-Caching
- Tests

## Roadmap
Native Mobile gehört zu **Phase 5** in [ROADMAP.md](../../ROADMAP.md). Bis dahin
ist `@fuelyn/web` der einzige unterstützte Client.
