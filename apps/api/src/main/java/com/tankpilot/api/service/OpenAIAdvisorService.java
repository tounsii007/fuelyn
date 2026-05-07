package com.tankpilot.api.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.tankpilot.api.model.dto.AIAdvisorRequest;
import com.tankpilot.api.model.dto.AIAdvisorResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class OpenAIAdvisorService {

    private static final Logger log = LoggerFactory.getLogger(OpenAIAdvisorService.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String model;
    private final int maxTokens;

    private final Cache<String, AIAdvisorResponse> cache;

    public OpenAIAdvisorService(
            RestTemplate restTemplate,
            ObjectMapper objectMapper,
            @Value("${tankpilot.openai.api-key}") String apiKey,
            @Value("${tankpilot.openai.model}") String model,
            @Value("${tankpilot.openai.max-tokens}") int maxTokens) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.apiKey = apiKey;
        this.model = model;
        this.maxTokens = maxTokens;

        this.cache = Caffeine.newBuilder()
                .maximumSize(200)
                .expireAfterWrite(15, TimeUnit.MINUTES)
                .build();
    }

    public AIAdvisorResponse getRecommendation(AIAdvisorRequest request) {
        // 1. Check cache
        String cacheKey = buildCacheKey(request);
        AIAdvisorResponse cached = cache.getIfPresent(cacheKey);
        if (cached != null) {
            log.debug("Returning cached AI advice for key: {}", cacheKey);
            return new AIAdvisorResponse(
                    cached.action(), cached.headline(), cached.explanation(),
                    cached.bestTimePrediction(), cached.savingsEstimate(), cached.confidence(),
                    cached.bestStation(), cached.priceOutlook(), cached.tip(),
                    true, cached.fromAI()
            );
        }

        // 2. Check if API key is configured
        if (apiKey == null || apiKey.isBlank()) {
            log.info("OpenAI API key not configured, returning fallback response");
            return buildFallbackResponse(request);
        }

        // 3. Build prompts
        String systemPrompt = buildSystemPrompt();
        String userPrompt = buildUserPrompt(request);

        // 4. Call OpenAI API
        try {
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
                    "temperature", 0.7
            );

            ResponseEntity<Map> response = restTemplate.exchange(
                    "https://api.openai.com/v1/chat/completions",
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    Map.class
            );

            // 5. Parse response
            AIAdvisorResponse aiResponse = parseOpenAIResponse(response.getBody());

            // 6. Cache result
            cache.put(cacheKey, aiResponse);

            log.info("AI advisor response generated successfully (action: {}, confidence: {})",
                    aiResponse.action(), aiResponse.confidence());
            return aiResponse;

        } catch (RestClientException e) {
            log.warn("OpenAI API call failed: {}", e.getMessage());
            AIAdvisorResponse fallback = buildFallbackResponse(request);
            cache.put(cacheKey, fallback);
            return fallback;
        } catch (Exception e) {
            log.error("Unexpected error in AI advisor: {}", e.getMessage(), e);
            return buildFallbackResponse(request);
        }
    }

    @SuppressWarnings("unchecked")
    private AIAdvisorResponse parseOpenAIResponse(Map<String, Object> responseBody) {
        try {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseBody.get("choices");
            if (choices == null || choices.isEmpty()) {
                throw new RuntimeException("No choices in OpenAI response");
            }

            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            String content = (String) message.get("content");

            Map<String, Object> parsed = objectMapper.readValue(content, new TypeReference<>() {
            });

            Map<String, Object> bestStationMap = parsed.containsKey("bestStation")
                    ? (Map<String, Object>) parsed.get("bestStation")
                    : Map.of("name", "", "reason", "");

            return new AIAdvisorResponse(
                    getStringOrDefault(parsed, "action", "wait"),
                    getStringOrDefault(parsed, "headline", "Analyse abgeschlossen"),
                    getStringOrDefault(parsed, "explanation", ""),
                    getStringOrDefault(parsed, "bestTimePrediction", ""),
                    getDoubleOrDefault(parsed, "savingsEstimate", 0.0),
                    getStringOrDefault(parsed, "confidence", "medium"),
                    new AIAdvisorResponse.BestStation(
                            getStringOrDefault(bestStationMap, "name", ""),
                            getStringOrDefault(bestStationMap, "reason", "")
                    ),
                    getStringOrDefault(parsed, "priceOutlook", ""),
                    getStringOrDefault(parsed, "tip", ""),
                    false,
                    true
            );

        } catch (Exception e) {
            log.error("Failed to parse OpenAI response: {}", e.getMessage());
            throw new RuntimeException("Failed to parse AI response", e);
        }
    }

    public AIAdvisorResponse buildFallbackResponse(AIAdvisorRequest request) {
        // Simple heuristic-based response
        DayOfWeek today = LocalDate.now().getDayOfWeek();
        int hour = LocalTime.now().getHour();

        boolean isGoodDay = today == DayOfWeek.TUESDAY || today == DayOfWeek.WEDNESDAY;
        boolean isGoodTime = hour >= 18 && hour <= 20;

        AIAdvisorRequest.StationPrice cheapest = request.prices().stream()
                .min(Comparator.comparingDouble(AIAdvisorRequest.StationPrice::price))
                .orElse(null);

        String action;
        String headline;
        String explanation;
        String confidence = "low";

        if (isGoodDay && isGoodTime) {
            action = "buy_now";
            headline = "Guter Zeitpunkt zum Tanken!";
            explanation = String.format(
                    "Dienstag/Mittwoch abends sind die Preise statistisch am niedrigsten. " +
                            "Aktuell ist %s die guenstigste Option.",
                    cheapest != null ? cheapest.stationName() : "keine Tankstelle verfuegbar"
            );
        } else if (isGoodDay) {
            action = "wait";
            headline = "Heute abend tanken!";
            explanation = "Di/Mi sind gute Tanktage. Warten Sie auf die Abendstunden (18-20 Uhr) fuer die besten Preise.";
        } else {
            action = "wait";
            headline = "Abwarten empfohlen";
            explanation = "Die besten Preise finden Sie typischerweise Di/Mi abends zwischen 18 und 20 Uhr.";
        }

        double savingsEstimate = 0.0;
        if (cheapest != null && request.prices().size() > 1) {
            double maxPrice = request.prices().stream()
                    .mapToDouble(AIAdvisorRequest.StationPrice::price).max().orElse(0);
            savingsEstimate = Math.round((maxPrice - cheapest.price()) * request.fillUpLiters() * 100.0) / 100.0;
        }

        return new AIAdvisorResponse(
                action,
                headline,
                explanation,
                "Dienstag oder Mittwoch, 18-20 Uhr",
                savingsEstimate,
                confidence,
                cheapest != null
                        ? new AIAdvisorResponse.BestStation(cheapest.stationName(), "Niedrigster aktueller Preis")
                        : new AIAdvisorResponse.BestStation("", "Keine Daten verfuegbar"),
                "Ohne KI-Analyse: Allgemeine Empfehlung basierend auf Wochentag und Uhrzeit.",
                "Konfigurieren Sie einen OpenAI API-Key fuer personalisierte Empfehlungen.",
                false,
                false
        );
    }

    private String buildCacheKey(AIAdvisorRequest request) {
        // Round coordinates to 2 decimal places for cache grouping
        String latKey = request.lat() != null ? String.format("%.2f", request.lat()) : "0";
        String lngKey = request.lng() != null ? String.format("%.2f", request.lng()) : "0";
        return request.fuelType() + ":" + latKey + ":" + lngKey;
    }

    private String buildSystemPrompt() {
        return """
                Du bist ein KI-Tankberater fuer die App "TankPilot". \
                Analysiere Preisdaten und gib eine fundierte Tankempfehlung.

                Antworte IMMER als valides JSON mit diesem Schema:
                {
                  "action": "buy_now" oder "wait",
                  "headline": "...",
                  "explanation": "...",
                  "bestTimePrediction": "...",
                  "savingsEstimate": 0.00,
                  "confidence": "high" oder "medium" oder "low",
                  "bestStation": { "name": "...", "reason": "..." },
                  "priceOutlook": "...",
                  "tip": "..."
                }

                Regeln:
                - Di/Mi typischerweise guenstiger, Fr/Sa teurer
                - 18-20 Uhr oft guenstiger, morgens teurer
                - Entfernung und Mehrverbrauch einbeziehen
                - NUR Deutsch antworten
                - NUR valides JSON, kein Markdown""";
    }

    private String buildUserPrompt(AIAdvisorRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("Kraftstoff: ").append(request.fuelType()).append("\n");
        sb.append("Aktuelle Preise:\n");

        for (AIAdvisorRequest.StationPrice p : request.prices()) {
            sb.append("- ").append(p.stationName())
                    .append(" (").append(p.brand()).append("): ")
                    .append(String.format("%.3f EUR", p.price()))
                    .append(", ").append(String.format("%.1f km", p.distance()))
                    .append("\n");
        }

        if (request.priceHistory() != null && !request.priceHistory().isEmpty()) {
            sb.append("\nPreisverlauf (letzte Tage):\n");
            for (AIAdvisorRequest.PricePoint h : request.priceHistory()) {
                sb.append("- ").append(h.timestamp()).append(": ")
                        .append(String.format("%.3f EUR", h.price())).append("\n");
            }
        }

        sb.append("\nTankmenge: ").append(request.fillUpLiters()).append(" L\n");
        sb.append("Wochentag: ").append(getDayOfWeekGerman()).append("\n");
        sb.append("Uhrzeit: ").append(LocalTime.now().getHour()).append(" Uhr\n");

        return sb.toString();
    }

    private String getDayOfWeekGerman() {
        return LocalDate.now().getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.GERMAN);
    }

    private static String getStringOrDefault(Map<String, Object> map, String key, String defaultValue) {
        Object value = map.get(key);
        return value != null ? value.toString() : defaultValue;
    }

    private static double getDoubleOrDefault(Map<String, Object> map, String key, double defaultValue) {
        Object value = map.get(key);
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        return defaultValue;
    }
}
