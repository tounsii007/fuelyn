package com.tankpilot.ai.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * Response DTO from the AI fuel advisor.
 *
 * <p>The first eleven fields preserve the original contract — clients
 * coded against them keep working. The optional {@code breakdown},
 * {@code perStationForecast}, and {@code effectiveBest} fields enrich
 * the response with explainability and per-station forecasts; they are
 * suppressed (not emitted) when null.</p>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AIAdvisorResponse(
        String action,           // "buy_now" or "wait"
        String headline,         // max 30 chars, German
        String explanation,      // 1-2 sentences
        String bestTimePrediction,
        double savingsEstimate,  // EUR
        String confidence,       // "high", "medium", "low"
        BestStation bestStation,
        String priceOutlook,     // 24h outlook
        String tip,              // practical saving tip
        boolean fromCache,
        boolean fromAI,          // false = local fallback

        // ─── Explainability ─────────────────────────────────────
        // Maps signal name → contribution to the buy/wait score.
        // Positive = pushed toward buy_now, negative = toward wait.
        Map<String, Double> breakdown,

        // The station with the lowest *effective* price (price + drive
        // cost amortised over the fill-up). Often equals bestStation,
        // but when the cheapest station is far away, this surfaces a
        // closer alternative that's actually a better deal.
        BestStation effectiveBest,

        // Per-station forecast quantiles (p10, p50, p90) for the next
        // 24 h. Computed only when priceHistory is supplied.
        List<StationForecast> perStationForecast
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BestStation(String name, String reason) {}

    /**
     * Predicted price quantiles for one station over the next 24 h.
     * {@code p10} = optimistic (chance the price will fall to this),
     * {@code p50} = median expectation, {@code p90} = pessimistic.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record StationForecast(
            String stationName,
            double currentPrice,
            double p10,
            double p50,
            double p90
    ) {}

    /**
     * Legacy 11-arg constructor — keep this so all existing call sites
     * (LocalHeuristicFallback, OpenAIAdvisorService, tests) compile
     * without modification. The new optional fields default to null.
     */
    public AIAdvisorResponse(
            String action, String headline, String explanation, String bestTimePrediction,
            double savingsEstimate, String confidence, BestStation bestStation,
            String priceOutlook, String tip, boolean fromCache, boolean fromAI
    ) {
        this(action, headline, explanation, bestTimePrediction, savingsEstimate,
                confidence, bestStation, priceOutlook, tip, fromCache, fromAI,
                null, null, null);
    }

    /** Create a copy with fromCache=true. */
    public AIAdvisorResponse withFromCache(boolean cached) {
        return new AIAdvisorResponse(action, headline, explanation, bestTimePrediction,
                savingsEstimate, confidence, bestStation, priceOutlook, tip, cached, fromAI,
                breakdown, effectiveBest, perStationForecast);
    }
}
