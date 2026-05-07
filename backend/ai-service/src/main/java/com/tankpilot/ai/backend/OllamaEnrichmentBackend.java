package com.tankpilot.ai.backend;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;
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
 * Local LLM enrichment via Ollama
 * (<a href="https://ollama.com/blog/openai-compatibility">OpenAI-compatible
 * chat completions API</a>).
 *
 * <p>Runs against a small instruction-tuned model
 * (default: {@code qwen2.5:3b-instruct}) hosted in a sibling Docker
 * container. The HTTP shape is identical to OpenAI's, so this class is
 * essentially a base-URL swap with a no-auth header.</p>
 *
 * <h3>Why local first</h3>
 * <ul>
 *   <li>Zero per-request cost</li>
 *   <li>Data never leaves the host — Tankerkönig prices never see a
 *       third-party</li>
 *   <li>Works offline / behind a corporate firewall</li>
 *   <li>Quality is "good enough" for narrative rewrites because the
 *       structured fields are already locked by the heuristic</li>
 * </ul>
 *
 * <p>This bean is created only when {@code tankpilot.ai.ollama.enabled}
 * is {@code true}, so the absence of an Ollama container does not
 * break the service.</p>
 */
@Component
@ConditionalOnProperty(prefix = "tankpilot.ai.ollama", name = "enabled", havingValue = "true", matchIfMissing = false)
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
            @Value("${tankpilot.ai.ollama.base-url:http://ollama:11434}") String baseUrl,
            @Value("${tankpilot.ai.ollama.model:qwen2.5:3b-instruct}") String model,
            @Value("${tankpilot.ai.ollama.temperature:0.4}") double temperature,
            @Value("${tankpilot.ai.ollama.timeout-ms:30000}") int timeoutMs
    ) {
        this.restTemplate = builder
                .connectTimeout(Duration.ofMillis(Math.min(5_000, timeoutMs)))
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

    @Override
    public boolean isAvailable() {
        // Cheap reachability probe — Ollama exposes /api/tags listing
        // installed models. We don't care about content; HTTP 200 is
        // enough proof of life. A failure here is logged but does NOT
        // throw — the orchestrator will simply skip this backend.
        try {
            ResponseEntity<String> probe = restTemplate.getForEntity(baseUrl + "/api/tags", String.class);
            return probe.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.debug("Ollama unreachable at {}: {}", baseUrl, e.getMessage());
            return false;
        }
    }

    @Override
    public AIAdvisorResponse enrich(AIAdvisorRequest request, AIAdvisorResponse baseline) {
        long start = System.currentTimeMillis();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", LlmPromptBuilder.systemPrompt()),
                        Map.of("role", "user",   "content", LlmPromptBuilder.userPrompt(request, baseline, objectMapper))
                ),
                "temperature", temperature,
                "stream", false,
                // Ollama supports `format: json` to constrain decoding.
                // Equivalent to OpenAI's response_format json_object.
                "format", "json"
        );

        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                baseUrl + "/api/chat",
                HttpMethod.POST,
                new HttpEntity<>(body, headers),
                (Class<Map<String, Object>>) (Class<?>) Map.class
        );

        long durationMs = System.currentTimeMillis() - start;
        Map<String, Object> respBody = response.getBody();
        if (respBody == null) {
            throw new IllegalStateException("Ollama returned empty body");
        }

        // Ollama /api/chat returns: { "message": { "role": "assistant", "content": "<json>" }, ... }
        @SuppressWarnings("unchecked")
        Map<String, Object> message = (Map<String, Object>) respBody.get("message");
        if (message == null) {
            throw new IllegalStateException("Ollama response missing 'message'");
        }
        String content = String.valueOf(message.get("content"));

        try {
            LlmPromptBuilder.NarrativeFields fields = objectMapper.readValue(
                    content, LlmPromptBuilder.NarrativeFields.class);

            log.info("[Ollama] {}ms model={} → headline=\"{}\"",
                    durationMs, model,
                    fields.headline() == null ? "(blank)" : fields.headline());

            return LlmPromptBuilder.mergeNarrative(baseline, fields);
        } catch (Exception parseError) {
            throw new IllegalStateException(
                    "Failed to parse Ollama JSON content: " + parseError.getMessage(), parseError);
        }
    }
}
