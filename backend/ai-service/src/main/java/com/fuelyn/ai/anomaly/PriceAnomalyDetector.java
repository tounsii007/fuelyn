package com.fuelyn.ai.anomaly;

import com.fuelyn.ai.stream.PriceHistoryBuffer;
import com.fuelyn.common.events.PriceUpdatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Price-anomaly detector — Phase C1.
 *
 * <p>Consumes the same Kafka stream as {@link PriceHistoryBuffer} and
 * flags observations that diverge meaningfully from the station's own
 * recent baseline. The signal is consumed by:
 * <ul>
 *   <li>{@code AdvisorService} — boost confidence on cheap-spike
 *       recommendations, downgrade on anomalous expensive moves.</li>
 *   <li>Push-notification dispatcher (future) — alert subscribers when
 *       their watched station drops below a price floor.</li>
 *   <li>Prometheus — counter `fuelyn.ai.anomalies_total{kind=*}`.</li>
 * </ul>
 *
 * <h3>Algorithm</h3>
 * Lightweight z-score on the rolling 96-point window:
 * <pre>
 *   z = (latestPrice − μ) / σ
 *   |z| ≥ Z_THRESHOLD  →  anomaly
 * </pre>
 * We require ≥ 12 points before emitting (otherwise σ is unstable),
 * and we suppress duplicate alerts for the same (stationId, fuelType)
 * within {@link #SUPPRESS_WINDOW}. The detector is stateless beyond
 * that — restart wipes the suppress map and emits a one-time burst
 * during reboot, which is acceptable.
 */
@Component
public class PriceAnomalyDetector {

    private static final Logger log = LoggerFactory.getLogger(PriceAnomalyDetector.class);

    /**
     * Minimum sample size before z-scoring is meaningful. Below this
     * we still record the event but skip the anomaly check.
     */
    private static final int MIN_SAMPLES = 12;

    /** Default deviation magnitude that triggers an alert. Tunable. */
    private static final double DEFAULT_Z_THRESHOLD = 2.5;

    /** Per-station suppression window — don't spam alerts at every poll. */
    private static final Duration SUPPRESS_WINDOW = Duration.ofMinutes(15);

    private final PriceHistoryBuffer buffer;
    private final double zThreshold;
    private final Map<String, Instant> lastAlertAt = new ConcurrentHashMap<>();

    public PriceAnomalyDetector(
            PriceHistoryBuffer buffer,
            @Value("${fuelyn.ai.anomaly.z-threshold:" + DEFAULT_Z_THRESHOLD + "}") double zThreshold
    ) {
        this.buffer = buffer;
        this.zThreshold = zThreshold;
    }

    /**
     * Inspect a freshly observed event.
     *
     * @return an {@link Anomaly} when the event crosses the threshold and is
     *         not suppressed; empty otherwise.
     */
    public Optional<Anomaly> detect(PriceUpdatedEvent event) {
        if (event == null || event.fuelType() == null || !Double.isFinite(event.newPrice())) {
            return Optional.empty();
        }

        String key = suppressKey(event.stationId(), event.fuelType());

        // Fast path: still within the suppression window from the last
        // emission. Skip the math entirely — the buffer aggregate is
        // only ~50 ns but the suppression check is ~1 ns.
        Instant last = lastAlertAt.get(key);
        if (last != null && Duration.between(last, Instant.now()).compareTo(SUPPRESS_WINDOW) < 0) {
            return Optional.empty();
        }

        Optional<PriceHistoryBuffer.Aggregate> aggOpt =
                buffer.aggregate(event.stationId(), event.fuelType());
        if (aggOpt.isEmpty()) return Optional.empty();
        PriceHistoryBuffer.Aggregate agg = aggOpt.get();
        if (agg.sampleCount() < MIN_SAMPLES) return Optional.empty();
        if (agg.stdDev() <= 1e-6) return Optional.empty(); // flat history

        double z = (event.newPrice() - agg.meanPrice()) / agg.stdDev();
        if (Math.abs(z) < zThreshold) return Optional.empty();

        Kind kind = z < 0 ? Kind.CHEAP_SPIKE : Kind.EXPENSIVE_SPIKE;
        lastAlertAt.put(key, Instant.now());

        Anomaly anomaly = new Anomaly(
                event.stationId(),
                event.stationName(),
                event.fuelType(),
                event.newPrice(),
                agg.meanPrice(),
                z,
                kind,
                Instant.now()
        );
        log.info("Price anomaly: station={} fuel={} z={} kind={} latest={} mean={}",
                anomaly.stationId(), anomaly.fuelType(),
                String.format("%.2f", anomaly.z()), anomaly.kind(),
                String.format("%.3f", anomaly.latestPrice()),
                String.format("%.3f", anomaly.meanPrice()));
        return Optional.of(anomaly);
    }

    private static String suppressKey(String stationId, String fuelType) {
        return stationId + "|" + fuelType;
    }

    /**
     * Anomaly classification. {@code CHEAP_SPIKE} is a buy signal,
     * {@code EXPENSIVE_SPIKE} is the opposite.
     */
    public enum Kind { CHEAP_SPIKE, EXPENSIVE_SPIKE }

    /** Immutable anomaly record. */
    public record Anomaly(
            String stationId,
            String stationName,
            String fuelType,
            double latestPrice,
            double meanPrice,
            double z,
            Kind kind,
            Instant detectedAt
    ) {}
}
