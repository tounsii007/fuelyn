package com.fuelyn.ai.backend;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;
import io.github.resilience4j.bulkhead.annotation.Bulkhead;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Premium-tier enrichment via OpenAI's chat completions API
 * (default: {@code gpt-4o-mini}).
 *
 * <p>Same prompt as the Ollama backend — only the transport, the auth
 * header, and the JSON-mode flag differ. In the tiered orchestrator
 * this backend runs only when local Ollama is unavailable or fails,
 * so token spend is bounded by Ollama's hit rate.</p>
 *
 * <p>This bean is created only when an API key is present, so the
 * absence of OpenAI configuration in dev does not break startup.</p>
 */
@Component
@ConditionalOnProperty(prefix = "fuelyn.ai.openai", name = "enabled", havingValue = "true", matchIfMissing = false)
public class OpenAIEnrichmentBackend implements EnrichmentBackend {

    private static final Logger log = LoggerFactory.getLogger(OpenAIEnrichmentBackend.class);
    private static final String OPENAI_URL = "https://api.openai.com/v1/chat/completions";

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String model;
    private final int maxTokens;
    private final double temperature;
    /**
     * Approximate USD cost per output token for the configured model. Keeps
     * the cost-estimate log accurate as OpenAI repricings happen. Default
     * matches gpt-4o-mini (60 ¢ / 1M output tokens, ≈ 0.0000006 USD/tok).
     * Operators bumping the model should update this in lockstep.
     */
    private final double costPerToken;

    public OpenAIEnrichmentBackend(
            RestTemplateBuilder builder,
            ObjectMapper objectMapper,
            @Value("${fuelyn.ai.openai.api-key:}") String apiKey,
            @Value("${fuelyn.ai.openai.model:gpt-4o-mini}") String model,
            @Value("${fuelyn.ai.openai.max-tokens:400}") int maxTokens,
            @Value("${fuelyn.ai.openai.temperature:0.6}") double temperature,
            @Value("${fuelyn.ai.openai.timeout-ms:30000}") int timeoutMs,
            @Value("${fuelyn.ai.openai.cost-per-token:0.00000060}") double costPerToken
    ) {
        this.restTemplate = builder
                .connectTimeout(Duration.ofMillis(Math.min(15_000, timeoutMs)))
                .readTimeout(Duration.ofMillis(timeoutMs))
                .build();
        this.objectMapper = objectMapper;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.costPerToken = costPerToken;
        log.info("OpenAIEnrichmentBackend ready — model={}, costPerToken={}, key={}",
                model, costPerToken, hasUsableKey() ? "configured" : "MISSING");
    }

    @Override
    public String name() {
        return "openai:" + model;
    }

    @Override
    public boolean isAvailable() {
        return hasUsableKey();
    }

    private boolean hasUsableKey() {
        return !apiKey.isEmpty() && !apiKey.startsWith("sk-...");
    }

    /** Phase A2 — Bulkhead caps concurrent OpenAI calls to bound token spend
     *  on bot storms. Falls through to baseline when over capacity. */
    @Bulkhead(name = "openai-enrich", fallbackMethod = "bulkheadRejected")
    @Override
    public AIAdvisorResponse enrich(AIAdvisorRequest request, AIAdvisorResponse baseline) {
        if (!hasUsableKey()) {
            throw new IllegalStateException("OpenAI API key not configured");
        }

        long start = System.currentTimeMillis();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", LlmPromptBuilder.systemPrompt()),
                        Map.of("role", "user",   "content", LlmPromptBuilder.userPrompt(request, baseline, objectMapper))
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

        long durationMs = System.currentTimeMillis() - start;
        Map<String, Object> respBody = response.getBody();
        if (respBody == null) {
            throw new IllegalStateException("OpenAI returned empty body");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) respBody.get("choices");
        if (choices == null || choices.isEmpty()) {
            throw new IllegalStateException("OpenAI response missing choices");
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
        if (message == null) {
            throw new IllegalStateException("OpenAI response missing message in choice[0]");
        }
        Object rawContent = message.get("content");
        if (rawContent == null) {
            throw new IllegalStateException("OpenAI response missing content in message");
        }
        // String.valueOf(null) returns the literal "null" — silently passing
        // that downstream produced JSON-parser failures with a misleading
        // root cause. Explicit null-check above gives a precise diagnostic.
        String content = rawContent.toString();

        @SuppressWarnings("unchecked")
        Map<String, Object> usage = (Map<String, Object>) respBody.get("usage");
        if (usage != null && usage.get("total_tokens") instanceof Number tokens) {
            double cost = tokens.doubleValue() * costPerToken;
            log.info("[OpenAI] {}ms, {} tokens, ~${} cost",
                    durationMs, tokens.intValue(), String.format("%.6f", cost));
        }

        try {
            LlmPromptBuilder.NarrativeFields fields = objectMapper.readValue(
                    content, LlmPromptBuilder.NarrativeFields.class);
            return LlmPromptBuilder.mergeNarrative(baseline, fields);
        } catch (Exception parseError) {
            throw new IllegalStateException(
                    "Failed to parse OpenAI JSON content: " + parseError.getMessage(), parseError);
        }
    }

    /** Bulkhead-rejection fallback for the @Bulkhead annotation. */
    @SuppressWarnings("unused")
    private AIAdvisorResponse bulkheadRejected(AIAdvisorRequest request, AIAdvisorResponse baseline, Throwable t) {
        log.warn("[OpenAI bulkhead] over capacity — falling through ({})", t.getMessage());
        throw new IllegalStateException("openai bulkhead rejected", t);
    }
}
