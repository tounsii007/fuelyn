package com.fuelyn.ai.backtest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.ai.fallback.LocalHeuristicFallback;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;

import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Standalone backtest harness for the heuristic.
 *
 * <p>Reads a price-history fixture (JSON), replays it hour-by-hour,
 * and at every step runs {@link LocalHeuristicFallback#analyze} as if
 * only the data <i>up to that moment</i> were known. The decision is
 * then evaluated against the truth that the rest of the dataset
 * carries: did waiting actually save money?</p>
 *
 * <h3>Fixture schema</h3>
 * <pre>
 * {
 *   "fuelType": "e10",
 *   "stations": [
 *     {
 *       "name": "Aral Mitte",
 *       "brand": "Aral",
 *       "distance": 1.2,
 *       "history": [
 *         { "ts": "2026-04-01T00:00:00Z", "price": 1.789 },
 *         { "ts": "2026-04-01T01:00:00Z", "price": 1.790 },
 *         …
 *       ]
 *     },
 *     …
 *   ]
 * }
 * </pre>
 *
 * <h3>Output</h3>
 * <p>Per-decision regret in cents and aggregate metrics:</p>
 * <ul>
 *   <li>Total decisions, buy / wait split</li>
 *   <li>Mean regret per decision (lower is better)</li>
 *   <li>Win rate vs. "always buy now" baseline</li>
 *   <li>Win rate vs. "always wait until Tue 19:00" baseline</li>
 * </ul>
 *
 * <h3>Usage</h3>
 * <pre>
 *   java -cp ... com.fuelyn.ai.backtest.BacktestRunner path/to/fixture.json
 * </pre>
 *
 * <p>The fixture path can be a local file or a classpath resource
 * (resolved via the system classloader if it doesn't exist on disk).</p>
 */
public final class BacktestRunner {

    public record Decision(
            Instant atTime,
            String action,
            double recommendedPrice,
            double observedMin24h,
            double observedMax24h,
            double regretCt        // signed: positive = we paid more than the 24-h min
    ) {}

    public record Report(
            int decisions,
            int buyNow,
            int waitCount,
            double meanRegretCt,
            double medianRegretCt,
            double meanRegretBuyOnly,
            double meanRegretWaitOnly,
            double winRateVsAlwaysBuyNow,
            double winRateVsAlwaysWaitTue
    ) {}

    private BacktestRunner() {}

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("Usage: BacktestRunner <fixture.json>");
            System.exit(2);
        }
        Path p = Path.of(args[0]);
        byte[] bytes;
        if (Files.exists(p)) {
            bytes = Files.readAllBytes(p);
        } else {
            try (var in = BacktestRunner.class.getClassLoader().getResourceAsStream(args[0])) {
                if (in == null) throw new IllegalArgumentException("Fixture not found: " + args[0]);
                bytes = in.readAllBytes();
            }
        }
        Report report = run(bytes);
        printReport(report, System.out);
    }

    public static Report run(byte[] fixtureJson) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root = mapper.readTree(fixtureJson);
        String fuelType = root.path("fuelType").asText("e10");

        // Build per-station price-time series
        List<StationSeries> stations = new ArrayList<>();
        for (JsonNode s : root.path("stations")) {
            String name  = s.path("name").asText();
            String brand = s.path("brand").asText("");
            double dist  = s.path("distance").asDouble(0);
            List<TimedPrice> series = new ArrayList<>();
            for (JsonNode pt : s.path("history")) {
                Instant ts = parseTs(pt.path("ts").asText());
                double price = pt.path("price").asDouble(Double.NaN);
                if (ts != null && !Double.isNaN(price)) {
                    series.add(new TimedPrice(ts, price));
                }
            }
            series.sort((a, b) -> a.ts().compareTo(b.ts()));
            if (!series.isEmpty()) stations.add(new StationSeries(name, brand, dist, series));
        }
        if (stations.isEmpty()) {
            return new Report(0, 0, 0, 0, 0, 0, 0, 0, 0);
        }

        // The replay schedule: every hour from earliest to latest-24h
        Instant earliest = stations.stream().map(s -> s.series().get(0).ts()).min(Instant::compareTo).orElseThrow();
        Instant latest   = stations.stream().map(s -> s.series().get(s.series().size() - 1).ts()).max(Instant::compareTo).orElseThrow();
        Instant cutoff   = latest.minus(Duration.ofHours(24));

        ZoneId zone = ZoneId.of("Europe/Berlin");
        List<Decision> decisions = new ArrayList<>();
        List<Double> regretAlwaysBuy = new ArrayList<>();
        List<Double> regretAlwaysWaitTue = new ArrayList<>();

        for (Instant t = earliest.plus(Duration.ofHours(24)); !t.isAfter(cutoff); t = t.plus(Duration.ofHours(1))) {
            // Build a request reflecting only the data up to t.
            List<AIAdvisorRequest.StationPrice> currentPrices = new ArrayList<>();
            List<AIAdvisorRequest.PricePoint> historyPoints  = new ArrayList<>();

            for (var s : stations) {
                Double currentPrice = priceAtOrBefore(s.series(), t);
                if (currentPrice == null) continue;
                currentPrices.add(new AIAdvisorRequest.StationPrice(
                        s.name(), s.brand(), currentPrice, s.distance(),
                        t.toString(), null, null
                ));
            }
            // Collect raw history (cheapest station each hour) over the trailing 24 h
            for (Instant h = t.minus(Duration.ofHours(23)); !h.isAfter(t); h = h.plus(Duration.ofHours(1))) {
                Double cheapestNow = cheapestAt(stations, h);
                if (cheapestNow != null) {
                    historyPoints.add(new AIAdvisorRequest.PricePoint(cheapestNow, h.toString()));
                }
            }
            if (currentPrices.isEmpty()) continue;

            AIAdvisorRequest req = new AIAdvisorRequest(
                    currentPrices, fuelType, historyPoints, 52.5, 13.4, 50);
            AIAdvisorResponse resp = LocalHeuristicFallback.analyze(req,
                    Clock.fixed(t, zone));

            // Truth: cheapest price among all stations within next 24 h.
            double recommendedPrice = currentPrices.stream()
                    .mapToDouble(AIAdvisorRequest.StationPrice::price).min().orElse(Double.NaN);
            double observedMin = minBetween(stations, t, t.plus(Duration.ofHours(24)));
            double observedMax = maxBetween(stations, t, t.plus(Duration.ofHours(24)));
            double regretCt;
            if ("buy_now".equals(resp.action())) {
                // We paid recommendedPrice now. Regret = how much cheaper we could have got within 24h.
                regretCt = (recommendedPrice - observedMin) * 100.0;
            } else {
                // We waited. Regret = how much MORE we paid by waiting (price might have RISEN).
                // Pessimistic interpretation: assume we ended up paying observedMax (worst case wait).
                regretCt = (observedMax - recommendedPrice) * 100.0;
                // Clamp at 0 because waiting and getting min24h is the optimist case
                regretCt = Math.max(0, regretCt);
            }
            decisions.add(new Decision(t, resp.action(), recommendedPrice, observedMin, observedMax, regretCt));

            // Baselines
            regretAlwaysBuy.add((recommendedPrice - observedMin) * 100.0);
            // "Always wait until Tue 19h": only act on Tue 19h, otherwise carry over
            LocalDateTime ldt = LocalDateTime.ofInstant(t, zone);
            if (ldt.getDayOfWeek() == java.time.DayOfWeek.TUESDAY && ldt.getHour() == 19) {
                regretAlwaysWaitTue.add((recommendedPrice - observedMin) * 100.0);
            } else {
                regretAlwaysWaitTue.add(Math.max(0, (observedMax - recommendedPrice) * 100.0));
            }
        }

        return summarize(decisions, regretAlwaysBuy, regretAlwaysWaitTue);
    }

    // ─── helpers ─────────────────────────────────────────────────

    private record TimedPrice(Instant ts, double price) {}
    private record StationSeries(String name, String brand, double distance, List<TimedPrice> series) {}

    private static Instant parseTs(String iso) {
        if (iso == null || iso.isBlank()) return null;
        try { return OffsetDateTime.parse(iso).toInstant(); }
        catch (Exception ignored) {}
        try { return Instant.parse(iso); }
        catch (Exception ignored) {}
        return null;
    }

    private static Double priceAtOrBefore(List<TimedPrice> series, Instant t) {
        Double last = null;
        for (var pt : series) {
            if (pt.ts().isAfter(t)) break;
            last = pt.price();
        }
        return last;
    }

    private static Double cheapestAt(List<StationSeries> stations, Instant t) {
        double best = Double.POSITIVE_INFINITY;
        for (var s : stations) {
            Double v = priceAtOrBefore(s.series(), t);
            if (v != null && v < best) best = v;
        }
        return Double.isInfinite(best) ? null : best;
    }

    private static double minBetween(List<StationSeries> stations, Instant from, Instant to) {
        double best = Double.POSITIVE_INFINITY;
        for (var s : stations) {
            for (var pt : s.series()) {
                if (pt.ts().isBefore(from)) continue;
                if (pt.ts().isAfter(to))    break;
                if (pt.price() < best) best = pt.price();
            }
        }
        return Double.isInfinite(best) ? Double.NaN : best;
    }

    private static double maxBetween(List<StationSeries> stations, Instant from, Instant to) {
        double best = Double.NEGATIVE_INFINITY;
        for (var s : stations) {
            for (var pt : s.series()) {
                if (pt.ts().isBefore(from)) continue;
                if (pt.ts().isAfter(to))    break;
                if (pt.price() > best) best = pt.price();
            }
        }
        return Double.isInfinite(best) ? Double.NaN : best;
    }

    private static Report summarize(List<Decision> decisions,
                                    List<Double> regretAlwaysBuy,
                                    List<Double> regretAlwaysWaitTue) {
        int buy = 0, waitN = 0;
        double sumRegret = 0;
        double sumRegretBuy = 0, sumRegretWait = 0;
        int buyCount = 0, waitCount = 0;
        List<Double> regrets = new ArrayList<>(decisions.size());
        for (var d : decisions) {
            sumRegret += d.regretCt();
            regrets.add(d.regretCt());
            if ("buy_now".equals(d.action())) {
                buy++; sumRegretBuy += d.regretCt(); buyCount++;
            } else {
                waitN++; sumRegretWait += d.regretCt(); waitCount++;
            }
        }
        regrets.sort(Double::compareTo);
        double median = regrets.isEmpty() ? 0 : regrets.get(regrets.size() / 2);

        int n = decisions.size();
        double meanOurs   = n == 0 ? 0 : sumRegret / n;
        double meanAlwaysBuy   = mean(regretAlwaysBuy);
        double meanAlwaysWaitTue = mean(regretAlwaysWaitTue);

        double winVsBuy  = compareWinRate(decisions, regretAlwaysBuy);
        double winVsWait = compareWinRate(decisions, regretAlwaysWaitTue);

        return new Report(
                n, buy, waitN,
                meanOurs, median,
                buyCount  == 0 ? 0 : sumRegretBuy / buyCount,
                waitCount == 0 ? 0 : sumRegretWait / waitCount,
                winVsBuy, winVsWait
        );
    }

    private static double mean(List<Double> values) {
        if (values.isEmpty()) return 0;
        double s = 0;
        for (double v : values) s += v;
        return s / values.size();
    }

    private static double compareWinRate(List<Decision> ours, List<Double> baselineRegret) {
        if (ours.size() != baselineRegret.size() || ours.isEmpty()) return 0;
        int wins = 0;
        for (int i = 0; i < ours.size(); i++) {
            if (ours.get(i).regretCt() < baselineRegret.get(i)) wins++;
        }
        return (double) wins / ours.size();
    }

    public static void printReport(Report r, PrintStream out) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("decisions", r.decisions());
        view.put("buy_now", r.buyNow());
        view.put("wait", r.waitCount());
        view.put("mean_regret_ct", round(r.meanRegretCt()));
        view.put("median_regret_ct", round(r.medianRegretCt()));
        view.put("mean_regret_when_buy_ct", round(r.meanRegretBuyOnly()));
        view.put("mean_regret_when_wait_ct", round(r.meanRegretWaitOnly()));
        view.put("win_rate_vs_always_buy_now", percent(r.winRateVsAlwaysBuyNow()));
        view.put("win_rate_vs_always_wait_tue", percent(r.winRateVsAlwaysWaitTue()));

        out.println("─── Backtest Report ───────────────");
        for (var e : view.entrySet()) {
            out.printf(Locale.GERMANY, "  %-30s  %s%n", e.getKey(), e.getValue());
        }
        out.println("───────────────────────────────────");
    }

    private static String round(double v)   { return String.format(Locale.GERMANY, "%.2f", v); }
    private static String percent(double v) { return String.format(Locale.GERMANY, "%.1f %%", v * 100); }
}
