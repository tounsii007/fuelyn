# Fuelyn — App-Store-Listing & ASO

Store-ready listing copy for the iOS App Store and Google Play, in **de / en / fr**,
aligned with Fuelyn's positioning: **the cheapest *stop*, not the cheapest *litre*** —
effective price (pump price + detour + loyalty rebate + reachability).

> Rationale (from the competitive analysis): incumbents rank for generic terms
> (`spritpreise`, `tankstelle`, `benzinpreis`, `günstig tanken`). We must cover those
> for discoverability **and** lead the differentiator (`effektivpreis`, `tankkarte`,
> `tankstopp`) where the incumbents don't compete. Character limits noted inline.

---

## iOS App Store

### de (primär)
- **App-Name** (max 30): `Fuelyn: Spritpreise & sparen` (28)
- **Untertitel** (max 30): `Der günstigste Tankstopp` (24)
- **Keywords** (max 100, kommagetrennt, keine Leerzeichen nach Komma):
  `spritpreise,tankstelle,benzinpreis,diesel,e10,e5,günstig tanken,tankkarte,tankstopp,spritrechner,adac,clever`
- **Promotional Text** (max 170):
  `Nicht der billigste Liter — der günstigste Tankstopp. Effektivpreis inkl. Umweg, Tankkarten-Rabatt und Reichweite. Live-Preise aus der amtlichen MTS-K-Quelle.`
- **Beschreibung** (max 4000): siehe [Langbeschreibung DE](#langbeschreibung-de)

### en (British)
- **App name** (max 30): `Fuelyn: Fuel Prices & Save` (26)
- **Subtitle** (max 30): `The cheapest fill-up` (20)
- **Keywords**: `fuel prices,petrol,diesel,fuel finder,cheap petrol,fuel card,station,fuel log,e10,e5,germany`
- **Promotional Text**: `Not the cheapest litre — the cheapest fill-up. Effective price with detour, fuel-card rebate and range factored in. Live prices from Germany's official MTS-K feed.`

### fr
- **Nom** (max 30): `Fuelyn : prix carburant` (23)
- **Sous-titre** (max 30): `Le plein le moins cher` (22)
- **Mots-clés**: `prix carburant,essence,diesel,station,carburant pas cher,carte carburant,e10,e5,sp95,plein,allemagne`
- **Texte promotionnel**: `Pas le litre le moins cher — le plein le moins cher. Prix réel : détour, remise carte carburant et autonomie compris. Prix en direct de la source officielle MTS-K.`

---

## Google Play

### de (primär)
- **Titel** (max 30): `Fuelyn: Spritpreise & sparen` (28)
- **Kurzbeschreibung** (max 80): `Nicht der billigste Liter — der günstigste Tankstopp. Effektivpreis-Navi.` (73)
- **Vollständige Beschreibung** (max 4000): siehe [Langbeschreibung DE](#langbeschreibung-de)

### en (British)
- **Title** (max 30): `Fuelyn: Fuel Prices & Save` (26)
- **Short description** (max 80): `Not the cheapest litre — the cheapest fill-up. Effective-price finder.` (69)

### fr
- **Titre** (max 30): `Fuelyn : prix carburant` (23)
- **Description courte** (max 80): `Pas le litre le moins cher — le plein le moins cher. Prix réel.` (62)

---

## Langbeschreibung DE

**Fuelyn findet nicht die billigste, sondern die sinnvollste Tankstelle.**

Die billigste Tankstelle nützt nichts, wenn der Umweg den Rabatt auffrisst. Fuelyn
rechnet den **Effektivpreis**: Pumpenpreis + Fahrtkosten für den Umweg +
Tankkarten-Rabatt + Reichweiten-Check. So siehst du, welcher Tankstopp sich für
*deine* Strecke wirklich lohnt.

**Warum Fuelyn**
• Live-Spritpreise aus der amtlichen Markttransparenzstelle (MTS-K) — E5, E10, Diesel
• Effektivpreis statt Pumpenpreis: Umweg, Tankkarte und Reichweite eingerechnet
• Preisprognose: wann es typischerweise günstiger wird — pro Wochentag und Uhrzeit
• Transparente Empfehlung mit nachvollziehbarer Begründung (keine Black-Box)
• Routenplaner mit optimalen Tankstopps + Grenzvergleich beim Nachbarland
• Tank-Logbuch: Verbrauch (L/100 km) und Kosten im Blick — inkl. Import (Kassenbon, Bank-CSV, Spritmonitor)
• Preisalarme, Favoriten, EV-Laden & Wasserstoff
• Datenschutz: dein Standort verlässt nie dein Gerät — wir senden nur Koordinaten, nie Identifier

Kostenlos nutzbar. Verfügbar auf Deutsch, Englisch und Französisch.

---

## Langbeschreibung EN (British)

**Fuelyn finds not the cheapest, but the smartest station.**

The cheapest station is no bargain if the detour eats the saving. Fuelyn computes the
**effective price**: pump price + the fuel cost of the detour + your loyalty-card
rebate + a reachability check — so you see which stop actually pays off for *your* route.

**Why Fuelyn**
• Live fuel prices from Germany's official transparency feed (MTS-K) — E5, E10, Diesel
• Effective price, not pump price: detour, fuel card and range factored in
• Price forecast: when it typically gets cheaper, by weekday and hour
• Transparent recommendation with a reason you can check — no black box
• Route planner with optimal stops + cross-border price comparison
• Fuel log: consumption (L/100 km) and cost — with receipt, bank-CSV and Spritmonitor import
• Price alerts, favourites, EV charging & hydrogen
• Privacy: your location never leaves your device — we send coordinates only, never identifiers

Free to use. Available in German, English and French.

---

## Notes for submission
- **Screenshots / preview**: not included here (need real device captures at store sizes:
  iOS 6.7"/6.5"/5.5"; Play phone/tablet). Capture map + BestDeal card + effective-price detail.
- **App icon**: `apps/web/src/app/icon.svg` / `apple-icon.tsx` — export required raster sizes.
- **Category**: Navigation (primary), Travel / Utilities (secondary) — matches manifest.
- **Privacy nutrition label**: location used *not* linked to identity; no tracking. Mirror the in-app privacy note.
- Bundle id: `com.fuelyn.app` (see `capacitor.config.ts`).
