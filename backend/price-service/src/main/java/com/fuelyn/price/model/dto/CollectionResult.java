package com.fuelyn.price.model.dto;

/**
 * Result summary of a price collection run.
 *
 * @param stationsCount number of stations processed
 * @param pricesCount   number of price snapshots saved
 * @param durationMs    total duration in milliseconds
 * @param status        "completed" or "failed"
 * @param error         error message if failed, null otherwise
 */
public record CollectionResult(
        int stationsCount,
        int pricesCount,
        long durationMs,
        String status,
        String error
) {
    public static CollectionResult success(int stations, int prices, long durationMs) {
        return new CollectionResult(stations, prices, durationMs, "completed", null);
    }

    public static CollectionResult failure(String error, long durationMs) {
        return new CollectionResult(0, 0, durationMs, "failed", error);
    }
}
