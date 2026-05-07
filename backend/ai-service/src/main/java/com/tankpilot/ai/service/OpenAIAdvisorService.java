package com.tankpilot.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tankpilot.ai.fallback.LocalHeuristicFallback;
import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Resilient OpenAI GPT-4o-mini integration for fuel price recommendations.
 *
 * <h3>Request Flow:</h3>
 * <pre>
 *   Request &#x2192; Cache Check &#x2192; [HIT] &#x2192; Return cached
 *                             &#x2192; [MISS] &#x2192; GPT-4o-mini API
 *                                           &#x2192; [SUCCESS] &#x2192; Cache + Return
 *                                           &#x2192; [FAILURE] &#x2192; Circuit Breaker
 *                                                            &#x2192; Local Fallback
 * </pre>
 *
 * <h3>Security:</h3>
 * <ul>
 *   <li>API key stored server-side only (never exposed to client)</li>
 *   <li>Input sanitization prevents prompt injection</li>
 *   <li>Response validation ensures well-formed JSON</li>
 * </ul>
 */
@Service
public class OpenAIAdvisorService {

    private static final Logger log = LoggerFactory.getLogger(OpenAIAdvisorService.class);
    private static final String OPENAI_URL = "https://api.openai.com/v1/chat/completions";

    private static final String[] DAYS_DE = {
            "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"
    };

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final Cache<String, AIAdvisorResponse> responseCache;

    @Value("${tankpilot.openai.api-key:}")
    private String apiKey;

    @Value("${tankpilot.openai.model:gpt-4o-mini}")
    private String model;

    @Value("${tankpilot.openai.max-tokens:800}")
    private int maxTokens;

    @Value("${tankpilot.openai.temperature:0.7}")
    private double temperature;

    public OpenAIAdvisorService(RestTemplateBuilder builder, ObjectMapper objectMapper) {
        this.restTemplate = builder
                .connectTimeout(Duration.ofSeconds(15))
                .readTimeout(Duration.ofSeconds(30))
                .build();
        this.objectMapper = objectMapper;
        this.responseCache = Caffeine.newBuilder()
                .maximumSize(200)
                .expireAfterWrite(15, TimeUnit.MINUTES)
                .build();
    }

    /**
     * Gets an AI-powered fuel recommendation.
     * Falls back to local heuristic on any failure.
     */
    @CircuitBreaker(name = "openai", fallbackMethod = "getRecommendationFallback")
    @Retry(name = "openai")
    public AIAdvisorResponse getRecommendation(AIAdvisorRequest request) {
        // 1. Check cache
        String cacheKey = buildCacheKey(request);
        AIAdvisorResponse cached = responseCache.getIfPresent(cacheKey);
        if (cached != null) {
            log.debug("Cache HIT for key: {}", cacheKey);
            return cached.withFromCache(true);
        }

        // 2. Validate API key
        if (apiKey == null || apiKey.isBlank() || apiKey.startsWith("sk-...")) {
            log.warn("OpenAI API key not configured, using fallback");
            return LocalHeuristicFallback.analyze(request);
        }

        // 3. Build prompts
        String systemPrompt = buildSystemPrompt();
        String userPrompt = sanitizeInput(buildUserPrompt(request));

        // 4. Call OpenAI
        long start = System.currentTimeMillis();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)
                ),
                "response_format", Map.of("type", "json_object"),
                "max_tokens", maxTokens,
                "temperature", temperature
        );

        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                OPENAI_URL, HttpMethod.POST,
                new HttpEntity<>(body, headers),
                (Class<Map<String, Object>>) (Class<?>) Map.class
        );

        long duration = System.currentTimeMillis() - start;

        // 5. Parse response
        AIAdvisorResponse result = parseResponse(response.getBody(), duration);

        // 6. Cache
        responseCache.put(cacheKey, result);

        return result;
    }

    /**
     * Fallback when OpenAI API is unavailable.
     * Returns a local heuristic-based recommendation — always works.
     */
    @SuppressWarnings("unused")
    private AIAdvisorResponse getRecommendationFallback(AIAdvisorRequest request, Throwable t) {
        log.warn("[Fallback] OpenAI unavailable ({}). Using local heuristic.", t.getMessage());
        return LocalHeuristicFallback.analyze(request);
    }

    private String buildSystemPrompt() {
        return """
                Du bist ein KI-Tankberater für die App "TankPilot".
                Wäge mehrere Signale ab und gib eine fundierte Tankempfehlung.

                Antworte IMMER als valides JSON mit genau diesem Schema:
                {
                  "action": "buy_now" oder "wait",
                  "headline": "max 30 Zeichen",
                  "explanation": "1-2 Sätze Erklärung",
                  "bestTimePrediction": "Wann ist der beste Zeitpunkt",
                  "savingsEstimate": 0.00,
                  "confidence": "high" oder "medium" oder "low",
                  "bestStation": { "name": "...", "reason": "..." },
                  "priceOutlook": "24h Preis-Ausblick",
                  "tip": "Praktischer Spar-Tipp"
                }

                Entscheidungsregeln (gewichtetes Voting, keine Einzelregel):
                1) Z-Score: ist der günstigste Preis ungewöhnlich tief
                   gegenüber dem lokalen Mittel (mehr als ~1 σ darunter)?
                2) Spread: bei <5 ct Spanne lohnt sich kaum ein Wechsel.
                3) Trend aus Preisverlauf: steigend → eher tanken,
                   fallend → eher warten, stabil → Markt entscheidet.
                4) Distanz-Effektivpreis: rechne pro Station
                   Effektivpreis = Preis + (2 × km × 0,18 €/km) / Liter.
                   Empfehle die Station mit niedrigstem Effektivpreis,
                   nicht zwingend dem niedrigsten Listenpreis.
                5) Wochentag: Di/Mi tendenziell günstig, Fr/Sa teuer.
                6) Uhrzeit: 18–20 Uhr Tiefpunkt, 6–9 Uhr Spitze.

                savingsEstimate = (Maxpreis − Minpreis) × Tankmenge.
                confidence = high nur wenn ≥20 Stationen UND klare Signale,
                              medium bei mittlerer Datenbasis,
                              low bei wenig Daten oder widersprüchlich.

                NUR Deutsch antworten. NUR valides JSON, kein Markdown.
                """;
    }

    private String buildUserPrompt(AIAdvisorRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("Kraftstoff: ").append(request.fuelType()).append("\n");
        sb.append("Aktuelle Preise:\n");

        if (request.prices() != null) {
            for (var p : request.prices().stream().limit(15).toList()) {
                sb.append("- ").append(p.stationName())
                        .append(" (").append(p.brand()).append("): ")
                        .append(String.format("%.3f EUR", p.price()))
                        .append(", ").append(String.format("%.1f km", p.distance()))
                        .append("\n");
            }
        }

        if (request.priceHistory() != null && !request.priceHistory().isEmpty()) {
            sb.append("\nPreisverlauf:\n");
            for (var h : request.priceHistory().stream().limit(20).toList()) {
                sb.append("- ").append(h.timestamp()).append(": ")
                        .append(String.format("%.3f EUR", h.price())).append("\n");
            }
        }

        sb.append("\nTankmenge: ").append(request.fillUpLiters()).append(" L\n");
        DayOfWeek dow = LocalDate.now().getDayOfWeek();
        sb.append("Wochentag: ").append(DAYS_DE[dow.getValue() - 1]).append("\n");
        sb.append("Uhrzeit: ").append(LocalTime.now().getHour()).append(" Uhr\n");

        return sb.toString();
    }

    /**
     * Sanitize input to prevent prompt injection attacks.
     */
    private String sanitizeInput(String input) {
        return input
                .replaceAll("[\\x00-\\x1F\\x7F]", "")
                .replaceAll("(?i)(system|assistant|ignore previous|forget|pretend)", "[filtered]")
                .substring(0, Math.min(input.length(), 2000));
    }

    @SuppressWarnings("unchecked")
    private AIAdvisorResponse parseResponse(Map<String, Object> responseBody, long durationMs) {
        try {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseBody.get("choices");
            if (choices == null || choices.isEmpty()) {
                throw new RuntimeException("No choices in OpenAI response");
            }

            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            String content = (String) message.get("content");

            AIAdvisorResponse parsed = objectMapper.readValue(content, AIAdvisorResponse.class);

            // Log usage
            Map<String, Object> usage = (Map<String, Object>) responseBody.get("usage");
            if (usage != null) {
                int totalTokens = ((Number) usage.get("total_tokens")).intValue();
                double cost = totalTokens * 0.00000060; // gpt-4o-mini approx rate
                log.info("[OpenAI] {}ms, {} tokens, ~${} cost", durationMs, totalTokens, String.format("%.6f", cost));
            }

            return new AIAdvisorResponse(
                    parsed.action(), parsed.headline(), parsed.explanation(),
                    parsed.bestTimePrediction(), parsed.savingsEstimate(), parsed.confidence(),
                    parsed.bestStation(), parsed.priceOutlook(), parsed.tip(),
                    false, true
            );
        } catch (Exception e) {
            log.error("Failed to parse OpenAI response: {}", e.getMessage());
            throw new RuntimeException("Failed to parse AI response", e);
        }
    }

    private String buildCacheKey(AIAdvisorRequest request) {
        double roundedLat = Math.round((request.lat() != null ? request.lat() : 0) * 100.0) / 100.0;
        double roundedLng = Math.round((request.lng() != null ? request.lng() : 0) * 100.0) / 100.0;
        return request.fuelType() + ":" + roundedLat + ":" + roundedLng;
    }
}
