package com.fuelyn.ai.backend;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

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

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;

import io.github.resilience4j.bulkhead.annotation.Bulkhead;

/**
 * Local LLM enrichment via Ollama (<a
 * href="https://ollama.com/blog/openai-compatibility">OpenAI-compatible chat completions API</a>).
 *
 * <p>Runs against a small instruction-tuned model (default: {@code qwen2.5:3b-instruct}) hosted in
 * a sibling Docker container. The HTTP shape is identical to OpenAI's, so this class is essentially
 * a base-URL swap with a no-auth header.
 *
 * <h3>Why local first</h3>
 *
 * <ul>
 *   <li>Zero per-request cost
 *   <li>Data never leaves the host — Tankerkönig prices never see a third-party
 *   <li>Works offline / behind a corporate firewall
 *   <li>Quality is "good enough" for narrative rewrites because the structured fields are already
 *       locked by the heuristic
 * </ul>
 *
 * <p>This bean is created only when {@code fuelyn.ai.ollama.enabled} is {@code true}, so the
 * absence of an Ollama container does not break the service.
 */
@Component
@ConditionalOnProperty(
        prefix = "fuelyn.ai.ollama",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class OllamaEnrichmentBackend implements EnrichmentBackend {

    private static final Logger log = LoggerFactory.getLogger(OllamaEnrichmentBackend.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String model;
    private final double temperature;

    public OllamaEnrichmentBackend(
            RestTemplateBuilder builder,
            ObjectMapper objectMapper,
            @Value("${fuelyn.ai.ollama.base-url:http://ollama:11434}") String baseUrl,
            @Value("${fuelyn.ai.ollama.model:qwen2.5:7b-instruct}") String model,
            @Value("${fuelyn.ai.ollama.temperature:0.4}") double temperature,
            @Value("${fuelyn.ai.ollama.timeout-ms:60000}") int timeoutMs) {
        // Read-timeout follows the configured budget. Connect-timeout
        // is a fixed short window because the model load happens after
        // TCP — if we can't open a socket in 5 s the container is gone.
        this.restTemplate =
                builder.connectTimeout(Duration.ofSeconds(5))
                        .readTimeout(Duration.ofMillis(timeoutMs))
                        .build();
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.model = model;
        this.temperature = temperature;
        log.info("OllamaEnrichmentBackend ready — base={}, model={}", this.baseUrl, this.model);
    }

    @Override
    public String name() {
        return "ollama:" + model;
    }

    /**
     * Phase A2 — cached liveness probe.
     *
     * <p>Hot path: every advisor request used to do a fresh /api/tags HTTP call to {@code
     * isAvailable()}. With request-level concurrency that's O(N) probes for an LLM that goes cold
     * for hours at a time — wasted connections, wasted latency, and worse: each failed probe costs
     * a full TCP timeout. We now cache the last result for {@value #LIVENESS_CACHE_MS} ms; failures
     * invalidate immediately so the next request retries.
     */
    private static final long LIVENESS_CACHE_MS = 5_000L;

    private final AtomicReference<Boolean> lastLiveness = new AtomicReference<>();
    private final AtomicLong lastLivenessAt = new AtomicLong(0);

    @Override
    public boolean isAvailable() {
        long now = System.currentTimeMillis();
        Boolean cached = lastLiveness.get();
        // Cache only POSITIVE results — a negative outcome retries every
        // request so transient outages clear quickly. The Resilience4j
        // CircuitBreaker handles the case where Ollama stays down for a
        // long time (open state short-circuits without HTTP).
        if (cached != null && cached && (now - lastLivenessAt.get()) < LIVENESS_CACHE_MS) {
            return true;
        }
        try {
            ResponseEntity<String> probe =
                    restTemplate.getForEntity(baseUrl + "/api/tags", String.class);
            boolean ok = probe.getStatusCode().is2xxSuccessful();
            lastLiveness.set(ok);
            if (ok) lastLivenessAt.set(now);
            return ok;
        } catch (Exception e) {
            log.debug("Ollama unreachable at {}: {}", baseUrl, e.getMessage());
            lastLiveness.set(false);
            return false;
        }
    }

    /**
     * Phase A2 — Bulkhead. Caps concurrent Ollama calls to a small number so a slow inference
     * (cold-load can take 15 s on CPU) doesn't tie up the whole HTTP thread pool. Tuned via {@code
     * resilience4j.bulkhead. instances.ollama-enrich.*} in {@code application.yml}; falls through
     * to the next backend in the chain if the bulkhead rejects the call.
     */
    @Bulkhead(name = "ollama-enrich", fallbackMethod = "bulkheadRejected")
    @Override
    public AIAdvisorResponse enrich(AIAdvisorRequest request, AIAdvisorResponse baseline) {
        long start = System.currentTimeMillis();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body =
                Map.of(
                        "model",
                        model,
                        "messages",
                        List.of(
                                Map.of(
                                        "role",
                                        "system",
                                        "content",
                                        LlmPromptBuilder.systemPrompt()),
                                Map.of(
                                        "role",
                                        "user",
                                        "content",
                                        LlmPromptBuilder.userPrompt(
                                                request, baseline, objectMapper))),
                        "temperature",
                        temperature,
                        "stream",
                        false,
                        // Ollama supports `format: json` to constrain decoding.
                        // Equivalent to OpenAI's response_format json_object.
                        "format",
                        "json");

        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> response =
                restTemplate.exchange(
                        baseUrl + "/api/chat",
                        HttpMethod.POST,
                        new HttpEntity<>(body, headers),
                        (Class<Map<String, Object>>) (Class<?>) Map.class);

        long durationMs = System.currentTimeMillis() - start;
        Map<String, Object> respBody = response.getBody();
        if (respBody == null) {
            throw new IllegalStateException("Ollama returned empty body");
        }

        // Ollama /api/chat returns: { "message": { "role": "assistant", "content": "<json>" }, ...
        // }
        @SuppressWarnings("unchecked")
        Map<String, Object> message = (Map<String, Object>) respBody.get("message");
        if (message == null) {
            throw new IllegalStateException("Ollama response missing 'message'");
        }
        String content = String.valueOf(message.get("content"));

        try {
            LlmPromptBuilder.NarrativeFields fields =
                    objectMapper.readValue(content, LlmPromptBuilder.NarrativeFields.class);

            log.info(
                    "[Ollama] {}ms model={} → headline=\"{}\"",
                    durationMs,
                    model,
                    fields.headline() == null ? "(blank)" : fields.headline());

            return LlmPromptBuilder.mergeNarrative(baseline, fields);
        } catch (Exception parseError) {
            throw new IllegalStateException(
                    "Failed to parse Ollama JSON content: " + parseError.getMessage(), parseError);
        }
    }

    /**
     * Bulkhead-rejection fallback. Signature mirrors the original method plus a trailing {@code
     * Throwable}. We surface the rejection as a runtime exception so {@code
     * AdvisorService.tryEnrichmentChain} treats us as failed and tries the next provider. Returning
     * the baseline here would silently swallow the over-capacity signal — bad for observability.
     */
    @SuppressWarnings("unused")
    private AIAdvisorResponse bulkheadRejected(
            AIAdvisorRequest request, AIAdvisorResponse baseline, Throwable t) {
        log.warn(
                "[Ollama bulkhead] over capacity — falling through to next backend ({})",
                t.getMessage());
        throw new IllegalStateException("ollama bulkhead rejected", t);
    }
}
