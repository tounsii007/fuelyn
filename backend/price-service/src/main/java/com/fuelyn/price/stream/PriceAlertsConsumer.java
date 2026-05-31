package com.fuelyn.price.stream;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fuelyn.common.events.EventEnvelope;
import com.fuelyn.common.events.PriceUpdatedEvent;

/**
 * Second consumer of {@code fuelyn.prices.v1}: scans every incoming price event for "alert-worthy"
 * conditions.
 *
 * <p>For now we evaluate two simple rules in-process:
 *
 * <ol>
 *   <li><b>Significant drop</b> — Δ ≤ −3 ct vs. previous price.
 *   <li><b>Significant rise</b> — Δ ≥ +3 ct.
 * </ol>
 *
 * <p>Matched alerts are published as a structured log line under the SLF4J marker {@code
 * PRICE_ALERT}. A future iteration will read these from the log/topic and push them to subscribed
 * users (web push, push notifications, email digest). For now the log is the alert channel — no
 * user infrastructure is needed and analysts can already build dashboards over it.
 *
 * <h3>Why a separate consumer group</h3>
 *
 * <p>Group ID {@code price-alerts} is independent of {@code price-service-stream}, so SSE fan-out
 * and alert evaluation scale and fail independently. If the alerts logic crashes, live UI still
 * updates.
 */
@Component
@ConditionalOnProperty(
        prefix = "fuelyn.kafka.consumer",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class PriceAlertsConsumer {

    private static final Logger log = LoggerFactory.getLogger(PriceAlertsConsumer.class);
    private static final org.slf4j.Marker ALERT_MARKER =
            org.slf4j.MarkerFactory.getMarker("PRICE_ALERT");

    /** Cents threshold for "significant" delta (signed). */
    private static final double THRESHOLD_CT = 3.0;

    /**
     * Shared, thread-safe Jackson mapper. Constructing one per event walked the JavaTimeModule's
     * reflection metadata for every payload — wasteful at the alert-consumer's high event rate.
     * Mirrors the pattern already in {@code PriceEventConsumer}.
     */
    private static final ObjectMapper SHARED_MAPPER =
            new ObjectMapper().registerModule(new JavaTimeModule());

    private final AtomicLong eventsSeen = new AtomicLong();
    private final AtomicLong alertsFired = new AtomicLong();

    @KafkaListener(
            topics = "${fuelyn.kafka.prices-topic:fuelyn.prices.v1}",
            containerFactory = "priceStreamListenerFactory",
            groupId = "${fuelyn.kafka.consumer.alerts-group-id:price-alerts}")
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void onPriceUpdated(EventEnvelope envelope, Acknowledgment ack) {
        eventsSeen.incrementAndGet();
        try {
            PriceUpdatedEvent ev = unwrap(envelope);
            if (ev == null || ev.deltaPrice() == null) {
                ack.acknowledge();
                return;
            }
            double deltaCt = ev.deltaPrice() * 100.0;
            if (Math.abs(deltaCt) >= THRESHOLD_CT) {
                fireAlert(envelope, ev, deltaCt);
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.warn(
                    "Alerts evaluation failed for envelope id={}: {}",
                    envelope == null ? "null" : envelope.id(),
                    e.getMessage());
            ack.acknowledge(); // skip; don't block topic on a single bad event
        }
    }

    private void fireAlert(EventEnvelope<?> envelope, PriceUpdatedEvent ev, double deltaCt) {
        alertsFired.incrementAndGet();
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("ts", Instant.now().toString());
        alert.put("eventId", envelope.id());
        alert.put("kind", deltaCt < 0 ? "DROP" : "RISE");
        alert.put("stationId", ev.stationId());
        alert.put("stationName", ev.stationName());
        alert.put("brand", ev.brand());
        alert.put("fuelType", ev.fuelType());
        alert.put("price", ev.newPrice());
        alert.put("deltaCt", round1(deltaCt));
        alert.put("postCode", ev.postCode());
        alert.put("lat", ev.lat());
        alert.put("lng", ev.lng());

        // Structured marker — downstream pipeline can ship to alerting bus.
        log.info(ALERT_MARKER, "{}", alert);
    }

    @SuppressWarnings("rawtypes")
    private PriceUpdatedEvent unwrap(EventEnvelope envelope) {
        if (envelope == null) return null;
        Object data = envelope.data();
        if (data instanceof PriceUpdatedEvent already) return already;
        if (data instanceof Map<?, ?> map) {
            try {
                return SHARED_MAPPER.convertValue(map, PriceUpdatedEvent.class);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    public long getEventsSeen() {
        return eventsSeen.get();
    }

    public long getAlertsFired() {
        return alertsFired.get();
    }
}
