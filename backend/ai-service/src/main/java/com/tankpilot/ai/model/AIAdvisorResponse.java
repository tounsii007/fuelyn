package com.tankpilot.ai.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Response DTO from the AI fuel advisor.
 *
 * <p>Fields match the GPT-4o-mini JSON output schema exactly.
 * {@code fromAI} indicates if the response came from OpenAI or local fallback.</p>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
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
        boolean fromAI           // false = local fallback
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BestStation(String name, String reason) {}

    /** Create a copy with fromCache=true. */
    public AIAdvisorResponse withFromCache(boolean cached) {
        return new AIAdvisorResponse(action, headline, explanation, bestTimePrediction,
                savingsEstimate, confidence, bestStation, priceOutlook, tip, cached, fromAI);
    }
}
