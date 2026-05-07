# Fuelyn — Architektur

## Überblick

```
┌────────────┐    ┌────────────┐
│  Web (3000)│    │ Mobile     │
│ Next.js 16 │    │ Expo 55    │
└─────┬──────┘    └─────┬──────┘
      │ BFF (Next routes)│
      │                  │
      └────┬─────────────┘
           │
     ┌─────▼─────┐
     │  Gateway  │  Spring Cloud Gateway (8080)
     │  + JWT    │  Resilience4j Circuit Breaker
     └─────┬─────┘
           │
   ┌───────┴────────┐
   │                │
┌──▼──────────┐ ┌───▼────────┐
│ price-service│ │ ai-service │
│    (8081)    │ │   (8082)   │
│  H2 + Cache  │ │  OpenAI    │
└──────────────┘ └────────────┘
```

## Services

### Web (apps/web)
- Next.js 16 App Router
- BFF-Routen unter `/api/*` proxyen an das Gateway und fallen bei Backend-Ausfall
  auf lokale Heuristiken (`packages/core`) zurück
- Rate-Limiter unter `src/lib/http/rate-limit.ts` — lazy sweep, opt-in Proxy-Trust

### Mobile (apps/mobile)
- Expo Router 55, React Native 0.83
- Shared Domain-Logik aus `@fuelyn/core`

### Gateway (backend/gateway)
- Spring Cloud Gateway
- Routen für `/api/v1/prices/**` → price-service, `/api/v1/ai/**` → ai-service
- CORS, Resilience4j Circuit Breaker pro Route, Default Fallbacks

### Price-Service (backend/price-service)
- Tankerkoenig-Proxy + OpenChargeMap-Integration
- Persistenz in H2 (dev) für Preis-Historie + Station-Meta
- Scheduled Collection (`0 */30 * * * *`) für Top-Städte
- Caching mit Caffeine

### AI-Service (backend/ai-service)
- OpenAI-Integration (gpt-4o-mini) für Tank-Empfehlungen
- Fallback: regelbasierte Heuristik im Service selbst
- Circuit Breaker + Retry um OpenAI-Aufrufe

### Common (backend/common)
- JWT-Provider + HMAC-Signer für Service-to-Service Calls
- Shared `ApiResponse<T>` Envelope
- `SecurityProperties` validiert Secrets beim Start (min. 32 Zeichen,
  keine Platzhalter-Werte — siehe [SecurityProperties.java](backend/common/src/main/java/com/fuelyn/common/config/SecurityProperties.java))
- `GlobalExceptionHandler` übersetzt Validation-Fehler in 400, Service-Fehler in deren Status

### Core (packages/core)
- Domain-Typen (`FuelType`, `Station`, `PriceRecommendation`)
- Zod-Schemas für Runtime-Validation
- Offline-Heuristik-Engine für Empfehlungen ohne Backend

## Request-Flow: Tank-Empfehlung

1. Client sendet `POST /api/ai/advisor` an Web-BFF
2. BFF prüft Rate-Limit (10/min pro Key, siehe [rate-limit.ts](apps/web/src/lib/http/rate-limit.ts))
3. BFF validiert Body und leitet mit HMAC-Signing an Gateway
4. Gateway routet an ai-service (Circuit Breaker: max. 10s Timeout)
5. ai-service ruft OpenAI auf, fällt bei Fehler auf lokale Heuristik zurück
6. Bei komplettem Backend-Ausfall: BFF selbst nutzt `@fuelyn/core`-Engine

## Sicherheits-Prinzipien

| Bereich                 | Maßnahme |
|-------------------------|----------|
| Service-zu-Service-Auth | HMAC + JWT, shared Secrets via ENV |
| Secret-Management       | Keine YAML-Defaults; `@PostConstruct`-Validation |
| CRON-Endpunkte          | `timingSafeEqual`-Vergleich, Token-only Access |
| Rate-Limiting           | Per-Instanz (in-memory), Proxy-Trust opt-in |
| Input-Validation        | Bean-Validation auf allen öffentlichen Endpoints |
| Error-Responses         | `GlobalExceptionHandler` maskiert interne Fehler |

## Bekannte Einschränkungen

- **Rate-Limiter** ist per-Instanz — für Multi-Region braucht es Redis/Upstash
- **H2** wird in Dev und ggf. Prod genutzt — Migration zu Postgres für Skalierung
- **Schedulings** laufen nur im price-service — keine HA, kein Locking

## Umgebungsvariablen

Siehe [README.md](./README.md#environment-variablen).
