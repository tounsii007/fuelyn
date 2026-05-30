# Fuelyn

[![CI](https://github.com/fuelyn/fuelyn/actions/workflows/ci.yml/badge.svg)](https://github.com/fuelyn/fuelyn/actions/workflows/ci.yml)

Kraftstoff- und Ladesäulen-Navigator für Deutschland. Vergleicht Preise,
erkennt Muster und liefert KI-gestützte Tank-Empfehlungen. Monorepo aus
Next.js-Web, Expo-Mobile, Java-Spring-Boot-Microservices und einem
shared TypeScript-Core.

## Pre-commit hooks

Husky + lint-staged sind via `npm install` automatisch aktiv. Bei jedem
Commit läuft ESLint mit `--fix` über die geänderten TS/TSX-Files (sub-
Sekunden-Feedback). `git push` triggert zusätzlich den vollen Typecheck-
und Test-Sweep für `@fuelyn/core` und `@fuelyn/web` — das fängt
Cross-File-Regressionen ab, die lint-staged nicht sieht.

Zu umgehen mit `git commit --no-verify` / `git push --no-verify` — nur
sparsam und bewusst nutzen.

## Projektstruktur

```
fuelyn/
├─ apps/
│  ├─ api/        # Java (separate Legacy-API)
│  ├─ web/        # Next.js 16 Web-App (BFF + UI + Edge-Middleware)
│  └─ mobile/     # Expo 55 Mobile-App — STUB, siehe apps/mobile/STATUS.md
├─ backend/       # Spring Boot 3.4 Multi-Modul (Java 21)
│  ├─ common/         # Shared Security, DTOs, Observability
│  ├─ gateway/        # Spring Cloud Gateway (Port 8080, mgmt 9080)
│  ├─ price-service/  # Preise + Tankerkoenig + OpenChargeMap (8081/9081)
│  └─ ai-service/     # OpenAI-basierte Tank-Empfehlungen (8082/9082)
├─ packages/
│  └─ core/       # Shared Domain Types + Zod-Schemas + Engine (single source)
├─ scripts/       # Dev-Utilities (Secret-Generator, pre-commit)
├─ .github/workflows/  # CI Pipeline
├─ docker-compose.yml
├─ turbo.json
└─ package.json
```

Tiefere Doku:

- [**FUELYN.md**](./FUELYN.md) — Brand identity, Design-System, Component-Hierarchy, Anti-Patterns
- [**ROADMAP.md**](./ROADMAP.md) — Per-Phase-Plan mit Goals, Deliverables, Acceptance-Criteria, Aufwandsschätzung
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System-Topologie

## Voraussetzungen

| Werkzeug | Version |
|----------|---------|
| Node.js  | >= 20   |
| npm      | 10.8.x  |
| Java     | 21      |
| Maven    | 3.9+    |
| Docker   | optional, für Compose |

## Schnellstart (Docker, HTTPS)

```bash
# 1. Secrets erzeugen (RSA-Keypair + Hex-Secrets)
./scripts/generate-dev-secrets.sh

# 2. Externe API-Keys eintragen (.env)
#    TANKERKOENIG_API_KEY, OPENCHARGEMAP_API_KEY, OPENAI_API_KEY

# 3. Stack hochfahren (Postgres + 3 Java-Services + Web + Caddy-TLS)
docker compose up -d --build

# 4. (einmalig) Caddy-Root-CA dem Host-Trust-Store hinzufügen
./scripts/trust-caddy-cert.sh
```

→ Web: **https://localhost:49443** · Gateway: **https://api.localhost:49443**

Alle Container kommunizieren intern per HTTP über das Docker-Bridge-Network.
Caddy terminiert TLS am Edge mit einer eigenen internen CA (Auto-Renew).
HTTP-Anfragen auf `:49080` werden 301 nach HTTPS umgeleitet, HSTS preload ist gesetzt.

### Optional: `fuelyn.localhost` als lokaler Alias

Statt `https://localhost:49443` kann der Stack auch unter
`https://fuelyn.localhost:49443` laufen — ohne Hosts-Datei zu
editieren. Die TLD `.localhost` ist von **RFC 6761 für Loopback
reserviert**, jedes moderne Betriebssystem und jeder Browser
löst `*.localhost` automatisch auf `127.0.0.1` auf. Es kollidiert
nie mit echter Public-DNS und ist immun gegen DNS-over-HTTPS
(was sonst Hosts-File-Tricks aushebelt).

| URL                                      | Zielservice |
|------------------------------------------|-------------|
| `https://fuelyn.localhost:49443`      | Web (Next.js) |
| `https://api.fuelyn.localhost:49443`  | Gateway (REST + SSE) |

Caddy generiert beim Start automatisch Zertifikate für beide
Hostnames aus dem internen CA — kein Setup nötig. (Echte
Public-Domain `fuelyn.localhost` ist absichtlich nicht konfiguriert,
sie gehört einem fremden Anbieter; siehe Production-Deployment
weiter unten falls du eine eigene Domain produktiv schalten willst.)

### Antivirus / Endpoint-Schutz: HTTPS-Inspection

Suiten wie **Kaspersky Plus**, **Bitdefender** oder **ESET** machen
TLS-Interception und haben einen eigenen Trust-Store, der den
Caddy-Root-CA nicht kennt. Sichtbares Symptom: „Die Zertifikatkette
ist unvollständig" obwohl Windows den Caddy-Root vertraut. Drei
Optionen:

1. **Hostname-Ausnahme** (schnellster Fix) — in der Antivirus-GUI
   `https://localhost:49443`, `https://fuelyn.localhost:49443` und die
   `api.*`-Pendants als vertrauenswürdige Adressen eintragen.
2. **Caddy-Root in den Antivirus-Trust-Store importieren**:
   ```bash
   docker exec fuelyn-caddy-1 \
     cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt
   ```
   Diese Datei dann in der AV-Software unter „Vertrauenswürdige
   Stamm-Zertifikate" hinzufügen.
3. **HTTPS-Scan komplett deaktivieren** — pragmatisch in dev,
   nicht empfohlen für Produktiv-Browsing.

### Port-Plan (alle non-default)

| Schicht       | Service          | Port                 |
|---------------|------------------|----------------------|
| **Public**    | Caddy HTTPS      | **49443**            |
|               | Caddy HTTP→HTTPS | 49080                |
| Internal      | Web (Next.js)    | 23700                |
|               | Postgres         | 25432                |
|               | Gateway          | 28800 (mgmt 29800)   |
|               | Price-Service    | 28810 (mgmt 29810)   |
|               | AI-Service       | 28820 (mgmt 29820)   |

Kein Container ist außer über Caddy direkt vom Host erreichbar (`expose:` statt `ports:`).
Die Spring-Boot-Defaults (8080/8081/8082) und `Next.js`-Default 3000 werden bewusst nicht
verwendet, um Standard-Port-Scanner ins Leere laufen zu lassen.

## Lokale Entwicklung (ohne Docker)

```bash
# JS-Abhängigkeiten
npm install

# Backend bauen + testen
cd backend && mvn clean install

# Web-App
npm run dev:web   # http://localhost:3000
```

Mindest-ENV für ein Java-Service-Start (Backend verweigert Boot bei
Placeholders/zu kurz/zu wenig Entropie):

```bash
export HMAC_SECRET="$(openssl rand -hex 32)"
export TANKERKOENIG_API_KEY=...
```

## Tests

```bash
npm test                  # Vitest (core + web)
cd backend && mvn test    # JUnit 5 + Mockito (alle Module)
```

Grobe Größenordnung (Test-Files, nicht Cases — die Zahlen wachsen
mit jedem Feature und werden hier nicht aktiv gepflegt):

| Suite                 | Files |
|-----------------------|-------|
| Java backend (JUnit5) | ~31   |
| TS core (vitest)      | ~35   |
| TS web (vitest)       | ~27   |

Substanz schwankt: harte Unit-Tests (`csrf`, `jwt`, `rate-limit`,
`pkpass-signer`, `stripe-signature`, engine/*) neben einigen
Smoke-/Snapshot-Tests gegen Tailwind-Klassen. Die Suite ist gut
genug, um Regressionen zu fangen, aber kein E2E-Ersatz —
Playwright/Cypress steht noch in Phase 4 der ROADMAP.

## CI

GitHub Actions führt bei jedem Push/PR aus:
- ESLint + TypeScript Type-Check (core + web)
- Vitest (core + web)
- Spotless (Java-Format-Check)
- Maven test (alle Backend-Module)
- Docker-Build-Smoke-Test (auf PRs)

## Sicherheit

| Schicht | Maßnahme |
|---------|----------|
| **Secrets**           | Entropy + Letter-Run-Policy lehnt Placeholder ab |
| **Service-Auth**      | HMAC-SHA256 (timestamp:body), Replay-Schutz (5 min), Body-Cap |
| **CRON-Endpunkte**    | `timingSafeEqual` (Node `crypto`) |
| **CSP / HSTS**        | Edge-Middleware; per-Request Nonce |
| **Rate Limit**        | Lazy-Sweep In-Memory + Trusted-Proxy-Opt-in |
| **Actuator**          | Separater Port (9080-9082), gebunden an `127.0.0.1` |
| **CORS**              | Explizite Header-Allowlist (kein `*` mit Credentials) |
| **Schema-Migration**  | Flyway; `ddl-auto: validate` |
| **Distributed Locks** | ShedLock auf JDBC verhindert Doppel-Cron |
| **Validation**        | Zod im BFF, Bean-Validation im Backend |

## Beobachtbarkeit

- **Strukturierte JSON-Logs** (Logstash-Encoder) im non-local-Profil
- **MDC**: `requestId` + `serviceId` (Edge → Gateway → Service korreliert)
- **Micrometer-Tracing** über OTel-Bridge (Sampling konfigurierbar)
- **Prometheus** unter `/actuator/prometheus`
- **Health Probes** (liveness/readiness) unter `/actuator/health/{liveness|readiness}`

## UX

- OKLCH-basiertes Design-Token-System (`apps/web/src/styles/tokens.css`)
- Light / Dark / System-Theme mit FOUC-freier Hydration
- Component-Library: `Button`, `Card`, `Input`, `Badge`, `Tooltip`, `Toast`,
  `Skeleton`, `ThemeToggle`
- `prefers-reduced-motion` respektiert
- Visible Focus-Ring (a11y)
