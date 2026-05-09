package com.fuelyn.ai.stream;

import com.fuelyn.ai.anomaly.AnomalyBroadcaster;
import com.fuelyn.ai.anomaly.PriceAnomalyDetector;
import com.fuelyn.ai.service.AdvisorService;
import com.fuelyn.common.events.EventEnvelope;
import com.fuelyn.common.events.PriceUpdatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Listens for {@link PriceUpdatedEvent} on the streaming bus and
 * invalidates the advisor's response cache so the next request
 * recomputes against fresh prices instead of serving a stale verdict.
 *
 * <p>The advisor cache key is derived from the user's geo-bucket
 * (lat/lng rounded to 0.01°) and the cheapest station in that bucket.
 * A safe over-approximation is to invalidate the entire cache on any
 * price event — at our throughput (a handful of polls per minute)
 * the cost is negligible and the correctness gain is real.</p>
 *
 * <p>Acknowledgement is manual: we ack only after invalidation
 * succeeds. If the consumer crashes mid-handler the broker will
 * redeliver the event, and the second invalidation is idempotent.</p>
 */
@Component
@ConditionalOnProperty(prefix = "fuelyn.kafka.consumer", name = "enabled", havingValue = "true", matchIfMissing = false)
public class PriceEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(PriceEventConsumer.class);

    private final AdvisorService advisorService;
    private final PriceHistoryBuffer historyBuffer;
    /** Phase C1 — anomaly detection. Optional so tests + minimal profiles
     *  can run without the bean wired. */
    private final PriceAnomalyDetector anomalyDetector;
    private final AnomalyBroadcaster anomalyBroadcaster;
    /** Total events received since startup (exposed for /actuator/metrics). */
    private final AtomicLong eventsReceived = new AtomicLong();
    /** Cache invalidations performed since startup. */
    private final AtomicLong cacheInvalidations = new AtomicLong();
    /** Events successfully recorded into the rolling history buffer. */
    private final AtomicLong eventsBuffered = new AtomicLong();
    /** Anomalies detected and broadcast since startup. */
    private final AtomicLong anomaliesEmitted = new AtomicLong();

    public PriceEventConsumer(
            AdvisorService advisorService,
            PriceHistoryBuffer historyBuffer,
            @Autowired(required = false) PriceAnomalyDetector anomalyDetector,
            @Autowired(required = false) AnomalyBroadcaster anomalyBroadcaster
    ) {
        this.advisorService = advisorService;
        this.historyBuffer = historyBuffer;
        this.anomalyDetector = anomalyDetector;
        this.anomalyBroadcaster = anomalyBroadcaster;
    }

    @KafkaListener(
            topics = "${fuelyn.kafka.prices-topic:fuelyn.prices.v1}",
            containerFactory = "priceListenerFactory"
    )
    @SuppressWarnings({"rawtypes", "unchecked"})
    public void onPriceUpdated(EventEnvelope envelope, Acknowledgment ack) {
        long received = eventsReceived.incrementAndGet();
        try {
            // Jackson deserialised the data() field as a LinkedHashMap;
            // we don't need the typed payload here — invalidation is
            // unconditional. We only sanity-check it's not null.
            PriceUpdatedEvent ev = unwrap(envelope);
            if (ev == null) {
                log.warn("Skipping envelope with no payload: id={}", envelope.id());
                ack.acknowledge();
                return;
            }
            log.debug("Price event #{} for {}/{}: {} -> {} EUR (Δ {})",
                    received, ev.stationId(), ev.fuelType(),
                    ev.previousPrice(), ev.newPrice(), ev.deltaPrice());

            // Persist into the per-station rolling window so the next
            // advisor request sees real history (EWMA, change-point,
            // station-relative z-score). Cheap: O(1) deque append +
            // size trim. Failures are non-fatal — the cache invalidation
            // below is the correctness-critical step.
            try {
                historyBuffer.record(ev);
                eventsBuffered.incrementAndGet();
            } catch (Exception bufferEx) {
                log.warn("History buffer rejected event for {}: {}",
                        ev.stationId(), bufferEx.getMessage());
            }

            // Cache-invalidation: drop everything once a price moved.
            // Cheap at our scale; correctness > micro-optimisation.
            advisorService.invalidateCache();
            cacheInvalidations.incrementAndGet();

            // Phase C1 — anomaly detection runs AFTER buffer.record so the
            // detector sees the freshly appended sample in its z-score
            // calculation. Broadcast best-effort; a failed publish never
            // blocks the consumer.
            if (anomalyDetector != null && anomalyBroadcaster != null) {
                anomalyDetector.detect(ev).ifPresent(anomaly -> {
                    try {
                        anomalyBroadcaster.publish(anomaly);
                        anomaliesEmitted.incrementAndGet();
                    } catch (Exception ex) {
                        log.warn("Anomaly broadcast failed for {}: {}",
                                anomaly.stationId(), ex.getMessage());
                    }
                });
            }

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process price event id={}: {}", envelope.id(), e.getMessage(), e);
            // Don't acknowledge → broker will redeliver on next poll
        }
    }

    public long getEventsReceived()      { return eventsReceived.get(); }
    public long getCacheInvalidations()  { return cacheInvalidations.get(); }
    public long getEventsBuffered()      { return eventsBuffered.get(); }

    /**
     * Best-effort coercion from the loosely-typed envelope.data()
     * back into a {@link PriceUpdatedEvent}. The JsonDeserializer in
     * KafkaConsumerConfig uses raw {@code EventEnvelope} for type
     * stability, so the inner data is a {@code LinkedHashMap} — we
     * use Jackson to coerce it back to the strong type.
     */
    @SuppressWarnings("rawtypes")
    private PriceUpdatedEvent unwrap(EventEnvelope envelope) {
        Object raw = envelope.data();
        if (raw == null) return null;
        if (raw instanceof PriceUpdatedEvent already) return already;
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper()
                    .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
                    .convertValue(raw, PriceUpdatedEvent.class);
        } catch (Exception e) {
            log.warn("Could not coerce payload to PriceUpdatedEvent: {}", e.getMessage());
            return null;
        }
    }
}
