package com.fuelyn.ai.controller;

import com.fuelyn.ai.fallback.LocalHeuristicFallback;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;
import com.fuelyn.ai.service.AdvisorService;
import com.fuelyn.common.dto.ApiResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * REST endpoint for AI-powered fuel recommendations.
 *
 * <p>Accepts price data and context, returns a structured recommendation.
 * Falls back to local heuristic on any AI failure &mdash; guaranteed response.</p>
 */
@RestController
@RequestMapping("/api/v1/ai")
@Validated
public class AIAdvisorController {

    private static final Logger log = LoggerFactory.getLogger(AIAdvisorController.class);

    private final AdvisorService aiService;

    public AIAdvisorController(AdvisorService aiService) {
        this.aiService = aiService;
    }

    /**
     * POST /api/v1/ai/advisor
     *
     * <p>Returns a fuel recommendation. Always succeeds &mdash; uses fallback on error.</p>
     */
    @PostMapping("/advisor")
    public ResponseEntity<ApiResponse<AIAdvisorResponse>> getAdvice(
            @Valid @RequestBody AIAdvisorRequest request
    ) {
        String requestId = UUID.randomUUID().toString().substring(0, 8);
        log.info("[{}] AI advisor request: fuelType={}, prices={}, lat={}, lng={}",
                requestId, request.fuelType(),
                request.prices() != null ? request.prices().size() : 0,
                request.lat(), request.lng());

        try {
            AIAdvisorResponse result = aiService.getRecommendation(request);
            log.info("[{}] AI response: action={}, confidence={}, fromAI={}, fromCache={}",
                    requestId, result.action(), result.confidence(), result.fromAI(), result.fromCache());
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            // If the failure was a thread interruption (Ollama HTTP client,
            // OpenAI client, or any executor downstream), restore the
            // interrupt flag before swallowing — otherwise the broad catch
            // erases the cancellation signal and any wrapping executor
            // (e.g. a request-timeout supervisor) would never see it.
            if (e instanceof InterruptedException
                    || e.getCause() instanceof InterruptedException) {
                Thread.currentThread().interrupt();
                log.warn("[{}] AI advisor interrupted, returning fallback", requestId);
            } else {
                log.error("[{}] AI advisor error, using fallback: {}", requestId, e.getMessage());
            }
            return ResponseEntity.ok(ApiResponse.success(LocalHeuristicFallback.analyze(request)));
        }
    }

    /**
     * GET /api/v1/ai/health
     */
    @GetMapping("/health")
    public ResponseEntity<ApiResponse<Map<String, Object>>> health() {
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "service", "ai-service",
                "status", "UP"
        )));
    }
}
