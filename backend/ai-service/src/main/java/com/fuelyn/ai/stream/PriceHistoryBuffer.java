package com.fuelyn.ai.stream;

import com.fuelyn.common.events.PriceUpdatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.DoubleSummaryStatistics;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * Bounded per-station rolling window of recent price observations,
 * fed exclusively by the Kafka consumer.
 *
 * <p>The advisor runs purely from the request body today — every signal
 * that wants "history" looks at {@code request.priceHistory()}, which
 * the BFF only supplies when the user has been observing prices long
 * enough on their own device. For brand-new sessions, the request is
 * empty and signals like {@code EwmaChangePoint} short-circuit to
 * {@code STABLE}.</p>
 *
 * <p>This buffer plugs that gap by retaining the last {@value #DEFAULT_PER_STATION_CAP}
 * change-events per (stationId, fuelType) tuple, observed via the
 * {@code fuelyn.prices.v1} Kafka topic. The advisor can then synthesise
 * a {@link com.fuelyn.ai.model.AIAdvisorRequest.PricePoint} list for
 * each station in the user's request, giving every signal real data to
 * work with on the very first request after warm-up.</p>
 *
 * <h3>Memory budget</h3>
 * Cap × stations × bytes ≈ 200 × 5_000 × 64 ≈ 64 MB worst case. Bounded
 * deques + a hard ceiling on station count keep this stable.
 *
 * <h3>Thread safety</h3>
 * Outer map is a {@link ConcurrentHashMap}. Each per-key value is a
 * {@link ConcurrentLinkedDeque} with manual size-trimming under the
 * dequeue's own intrinsic ordering. Reads always copy into a snapshot
 * list before returning.
 */
@Component
public class PriceHistoryBuffer {

    private static final Logger log = LoggerFactory.getLogger(PriceHistoryBuffer.class);

    /** Per-tuple capacity. Tankerkönig polls every 5 min ⇒ 96 ≈ 8 h. */
    public static final int DEFAULT_PER_STATION_CAP = 96;

    /** Outer cap so a misconfigured pipeline cannot leak unbounded keys. */
    private static final int MAX_TUPLES = 5_000;

    private final int perStationCap;
    private final Map<String, ConcurrentLinkedDeque<PricePoint>> store = new ConcurrentHashMap<>();

    public PriceHistoryBuffer() {
        this(DEFAULT_PER_STATION_CAP);
    }

    public PriceHistoryBuffer(int perStationCap) {
        this.perStationCap = perStationCap;
    }

    /**
     * One observation. Lightweight record so the deque payload stays
     * small (24 bytes + object header).
     */
    public record PricePoint(double price, Instant observedAt) {}

    /**
     * Ingest a Kafka event. The same point is indexed under both
     * {@code stationId} (UUID) AND {@code stationName} so the advisor
     * — whose request body only carries human-readable names — can look
     * it up reliably. Duplicate insertion is acceptable: callers always
     * read via one key, and the per-key dequeue stays bounded.
     */
    public void record(PriceUpdatedEvent event) {
        if (event == null || event.fuelType() == null) return;
        // PriceUpdatedEvent.observedAt is already a typed java.time.Instant
        // (set by the producer); fall back to wall-clock now() if Jackson
        // somehow handed us null after deserialisation.
        Instant when = event.observedAt() != null ? event.observedAt() : Instant.now();
        if (!Double.isFinite(event.newPrice()) || event.newPrice() <= 0) return;

        PricePoint point = new PricePoint(event.newPrice(), when);
        appendUnderKey(event.stationId(), event.fuelType(), point);
        appendUnderKey(event.stationName(), event.fuelType(), point);
    }

    private void appendUnderKey(String identifier, String fuelType, PricePoint point) {
        if (identifier == null || identifier.isBlank()) return;
        String key = key(identifier, fuelType);
        if (store.size() >= MAX_TUPLES && !store.containsKey(key)) {
            evictOldestTuple();
        }
        ConcurrentLinkedDeque<PricePoint> deque =
                store.computeIfAbsent(key, k -> new ConcurrentLinkedDeque<>());
        deque.addLast(point);
        while (deque.size() > perStationCap) {
            deque.pollFirst();
        }
    }

    /**
     * @return immutable snapshot of recent points for this tuple, oldest
     *         first; empty list if no events have been buffered yet.
     */
    public List<PricePoint> recent(String stationId, String fuelType) {
        ConcurrentLinkedDeque<PricePoint> deque = store.get(key(stationId, fuelType));
        if (deque == null || deque.isEmpty()) return List.of();
        List<PricePoint> snapshot = new ArrayList<>(deque);
        snapshot.sort(Comparator.comparing(PricePoint::observedAt));
        return Collections.unmodifiableList(snapshot);
    }

    /**
     * Aggregated stats over the buffered window — {@code null} when no
     * data exists for the tuple. Useful for prompt enrichment + the
     * station-relative baseline signal.
     */
    public Optional<Aggregate> aggregate(String stationId, String fuelType) {
        List<PricePoint> recent = recent(stationId, fuelType);
        if (recent.isEmpty()) return Optional.empty();

        DoubleSummaryStatistics stats = recent.stream()
                .mapToDouble(PricePoint::price)
                .summaryStatistics();
        double mean = stats.getAverage();
        double sumSq = 0;
        for (PricePoint p : recent) {
            double d = p.price() - mean;
            sumSq += d * d;
        }
        double stdDev = recent.size() > 1 ? Math.sqrt(sumSq / (recent.size() - 1)) : 0.0;
        Instant first = recent.get(0).observedAt();
        Instant last = recent.get(recent.size() - 1).observedAt();
        return Optional.of(new Aggregate(
                recent.size(),
                stats.getMin(),
                stats.getMax(),
                mean,
                stdDev,
                first,
                last,
                recent.get(recent.size() - 1).price()
        ));
    }

    /** Total tuples currently retained — exposed for diagnostic logging. */
    public int trackedTuples() { return store.size(); }

    /** Total points across all tuples — exposed for diagnostic logging. */
    public long totalPoints() {
        return store.values().stream().mapToLong(ConcurrentLinkedDeque::size).sum();
    }

    /**
     * Statistics over the buffered window for one (station, fuelType)
     * tuple. {@code latestPrice} is the most recently observed price,
     * {@code first}/{@code last} bound the time window.
     */
    public record Aggregate(
            int sampleCount,
            double minPrice,
            double maxPrice,
            double meanPrice,
            double stdDev,
            Instant first,
            Instant last,
            double latestPrice
    ) {
        /** Z-score of the current price relative to this station's own history. */
        public double currentZ() {
            if (stdDev <= 1e-6) return 0;
            return (latestPrice - meanPrice) / stdDev;
        }
    }

    private static String key(String stationId, String fuelType) {
        return stationId + "|" + fuelType;
    }

    private void evictOldestTuple() {
        // Evict the deque whose newest entry is oldest. O(N) but only
        // runs when the outer cap is reached, which is a soft ceiling
        // not a hot path.
        String victim = null;
        Instant oldest = Instant.MAX;
        for (var e : store.entrySet()) {
            PricePoint last = e.getValue().peekLast();
            if (last == null) { victim = e.getKey(); break; }
            if (last.observedAt().isBefore(oldest)) {
                oldest = last.observedAt();
                victim = e.getKey();
            }
        }
        if (victim != null) {
            store.remove(victim);
        }
    }
}
