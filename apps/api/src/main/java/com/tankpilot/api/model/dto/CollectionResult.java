package com.tankpilot.api.model.dto;

public record CollectionResult(
        int stationsCount,
        int pricesCount,
        String status,
        String error,
        long durationMs
) {
    public static CollectionResult success(int stationsCount, int pricesCount, long durationMs) {
        return new CollectionResult(stationsCount, pricesCount, "completed", null, durationMs);
    }

    public static CollectionResult failure(String error, long durationMs) {
        return new CollectionResult(0, 0, "failed", error, durationMs);
    }
}
