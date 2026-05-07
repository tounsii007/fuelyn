package com.tankpilot.ai.fallback;

import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;

/**
 * Local heuristic fallback when OpenAI API is unavailable.
 *
 * <p>Provides a reasonable recommendation based on:</p>
 * <ul>
 *   <li>Price comparison across stations</li>
 *   <li>Day-of-week patterns (empirical data from Germany)</li>
 *   <li>Time-of-day patterns</li>
 *   <li>Distance-adjusted cost analysis</li>
 * </ul>
 *
 * <p>This ensures the app <strong>always</strong> provides value, even without AI.</p>
 */
public final class LocalHeuristicFallback {

    private LocalHeuristicFallback() {}

    /**
     * Analyzes the given request and returns a heuristic-based recommendation.
     */
    public static AIAdvisorResponse analyze(AIAdvisorRequest request) {
        List<AIAdvisorRequest.StationPrice> prices = request.prices();
        if (prices == null || prices.isEmpty()) {
            return defaultResponse(request.fillUpLiters());
        }

        // Find cheapest and nearest
        AIAdvisorRequest.StationPrice cheapest = prices.stream()
                .min(Comparator.comparingDouble(AIAdvisorRequest.StationPrice::price))
                .orElse(prices.get(0));

        AIAdvisorRequest.StationPrice nearest = prices.stream()
                .min(Comparator.comparingDouble(AIAdvisorRequest.StationPrice::distance))
                .orElse(prices.get(0));

        double avgPrice = prices.stream().mapToDouble(AIAdvisorRequest.StationPrice::price).average().orElse(0);

        // Day-of-week heuristic
        DayOfWeek dow = LocalDate.now().getDayOfWeek();
        boolean isCheapDay = dow == DayOfWeek.TUESDAY || dow == DayOfWeek.WEDNESDAY;
        boolean isExpensiveDay = dow == DayOfWeek.FRIDAY || dow == DayOfWeek.SATURDAY;

        // Time-of-day heuristic
        int hour = LocalTime.now().getHour();
        boolean isCheapTime = hour >= 18 && hour <= 20;
        boolean isExpensiveTime = hour >= 6 && hour <= 9;

        // Decision
        boolean belowAvg = cheapest.price() < avgPrice * 0.998;
        boolean shouldBuy = (belowAvg && !isExpensiveDay) || (isCheapDay && isCheapTime);

        String action = shouldBuy ? "buy_now" : "wait";
        String headline = shouldBuy ? "Jetzt tanken!" : "Warten lohnt sich";

        String explanation;
        if (shouldBuy) {
            explanation = String.format("Der guenstigste Preis liegt bei %.3f EUR bei %s. %s",
                    cheapest.price(), cheapest.stationName(),
                    isCheapDay ? "Dienstag/Mittwoch sind typischerweise guenstig." : "");
        } else {
            explanation = isExpensiveDay
                    ? "Freitag/Samstag sind erfahrungsgemaess teurer. Versuche es Dienstag oder Mittwoch."
                    : String.format("Der Preis liegt ueber dem Durchschnitt (%.3f EUR). Warte auf einen besseren Zeitpunkt.", avgPrice);
        }

        double spread = prices.stream().mapToDouble(AIAdvisorRequest.StationPrice::price).max().orElse(0)
                - prices.stream().mapToDouble(AIAdvisorRequest.StationPrice::price).min().orElse(0);
        double savings = Math.round(spread * request.fillUpLiters() * 100.0) / 100.0;

        String confidence = prices.size() >= 10 ? "medium" : "low";

        return new AIAdvisorResponse(
                action, headline, explanation,
                "Preise fallen typischerweise dienstags/mittwochs, 18-20 Uhr.",
                savings, confidence,
                new AIAdvisorResponse.BestStation(cheapest.stationName(),
                        String.format("Guenstigster Preis: %.3f EUR, %.1f km entfernt", cheapest.price(), cheapest.distance())),
                isCheapDay ? "Heute ist ein typischer Niedrigpreistag."
                        : "Die naechsten guenstigen Tage sind Dienstag/Mittwoch.",
                "Tanke abends zwischen 18-20 Uhr fuer die besten Preise.",
                false, false
        );
    }

    private static AIAdvisorResponse defaultResponse(int fillUpLiters) {
        return new AIAdvisorResponse(
                "wait", "Keine Daten", "Es liegen keine Preisdaten vor.",
                "Preise fallen typischerweise dienstags.", 0, "low",
                null, "Unbekannt", "Vergleiche Preise vor dem Tanken.",
                false, false
        );
    }
}
