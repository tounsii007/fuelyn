package com.tankpilot.ai.fallback;

import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class LocalHeuristicFallbackTest {

    @Test
    void analyze_returnsDefaultForEmptyPrices() {
        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(), "e10", null, 52.5, 13.4, 50
        );
        // The record validates @NotEmpty at bean-validation layer, but the
        // fallback itself is defensive and must not throw on empty input.
        AIAdvisorResponse response = LocalHeuristicFallback.analyze(req);

        assertThat(response.action()).isEqualTo("wait");
        assertThat(response.confidence()).isEqualTo("low");
        assertThat(response.fromAI()).isFalse();
        assertThat(response.bestStation()).isNull();
    }

    @Test
    void analyze_pointsAtCheapestStation() {
        var aral = new AIAdvisorRequest.StationPrice("Aral Mitte", "Aral", 1.739, 1.2);
        var shell = new AIAdvisorRequest.StationPrice("Shell Nord", "Shell", 1.699, 2.3);
        var jet = new AIAdvisorRequest.StationPrice("JET City", "JET", 1.759, 0.9);

        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(aral, shell, jet), "e10", null, 52.5, 13.4, 50
        );

        AIAdvisorResponse response = LocalHeuristicFallback.analyze(req);

        assertThat(response.bestStation()).isNotNull();
        assertThat(response.bestStation().name()).isEqualTo("Shell Nord");
        assertThat(response.action()).isIn("buy_now", "wait");
    }

    @Test
    void analyze_savingsReflectsPriceSpread() {
        var cheap = new AIAdvisorRequest.StationPrice("A", "A", 1.600, 1.0);
        var expensive = new AIAdvisorRequest.StationPrice("B", "B", 1.800, 1.0);

        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(cheap, expensive), "e10", null, 52.5, 13.4, 50
        );

        AIAdvisorResponse response = LocalHeuristicFallback.analyze(req);

        // Spread 0.20 EUR * 50 L = 10.00 EUR
        assertThat(response.savingsEstimate()).isEqualTo(10.0);
    }

    @Test
    void analyze_confidenceScalesWithDataSize() {
        List<AIAdvisorRequest.StationPrice> many = java.util.stream.IntStream.range(0, 10)
                .mapToObj(i -> new AIAdvisorRequest.StationPrice("S" + i, "Brand", 1.70 + i * 0.01, i))
                .toList();

        AIAdvisorRequest req = new AIAdvisorRequest(many, "e10", null, null, null, 50);

        AIAdvisorResponse response = LocalHeuristicFallback.analyze(req);

        assertThat(response.confidence()).isEqualTo("medium");
    }
}
