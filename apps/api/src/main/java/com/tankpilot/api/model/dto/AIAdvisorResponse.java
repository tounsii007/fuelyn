package com.tankpilot.api.model.dto;

public record AIAdvisorResponse(
        String action,
        String headline,
        String explanation,
        String bestTimePrediction,
        double savingsEstimate,
        String confidence,
        BestStation bestStation,
        String priceOutlook,
        String tip,
        boolean fromCache,
        boolean fromAI
) {
    public record BestStation(String name, String reason) {
    }
}
