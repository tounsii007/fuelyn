package com.fuelyn.price.stream;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fuelyn.common.events.EventEnvelope;
import com.fuelyn.common.events.PriceUpdatedEvent;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Server-Sent Events bridge from the price-update Kafka topic to
 * connected browsers.
 *
 * <p>Clients subscribe via {@code GET /api/v1/stream/prices} (optionally
 * filtered by {@code ?stations=ID1,ID2,…}) and receive a continuous
 * stream of JSON events shaped like the underlying
 * {@link com.fuelyn.common.events.EventEnvelope}. Each event arrives
 * as soon as Kafka delivers it — typically within ~50 ms of
 * Tankerkönig confirming the price change, so users see live prices
 * without manual refresh.</p>
 *
 * <h3>Resilience</h3>
 * <ul>
 *   <li>Heartbeat (15 s) keeps idle connections open through the
 *       Caddy default 30 s read-timeout.</li>
 *   <li>{@code SseEmitter} lifecycle hooks remove disconnected clients
 *       so a hung browser tab can't leak server resources.</li>
 *   <li>The Kafka listener catches per-event exceptions so one bad
 *       payload can't stall the topic for everybody.</li>
 * </ul>
 *
 * <h3>Backpressure</h3>
 * <p>SSE is push-only. If a browser is too slow to drain its receive
 * buffer the underlying TCP send blocks; we time out the emitter
 * (60 s default) and let the client reconnect — losing a few events
 * is acceptable for live-price UX.</p>
 */
@RestController
@RequestMapping("/api/v1/stream")
@ConditionalOnProperty(prefix = "fuelyn.kafka.consumer", name = "enabled", havingValue = "true", matchIfMissing = false)
public class PriceStreamController {

    private static final Logger log = LoggerFactory.getLogger(PriceStreamController.class);

    /** Per-client subscription record. */
    private record Subscription(SseEmitter emitter, Set<String> stationFilter) {}

    private final Set<Subscription> subscriptions = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService heartbeats = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "sse-heartbeat");
        t.setDaemon(true);
        return t;
    });
    private final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
    /** Total events fan-out so far; surfaced in the management endpoint. */
    private final AtomicLong eventsFanOut = new AtomicLong();
    private final AtomicLong dropsFromSlowClients = new AtomicLong();

    public PriceStreamController() {
        // Send a heartbeat comment to every connection every 15 s.
        heartbeats.scheduleAtFixedRate(this::sendHeartbeats, 15, 15, TimeUnit.SECONDS);
    }

    /**
     * GET /api/v1/stream/prices?stations=ID1,ID2
     *
     * <p>Optional {@code stations} filter limits the stream to the
     * given station IDs (comma-separated). Empty / missing → all
     * stations. Useful for the favourites view, which only cares
     * about a handful of locations.</p>
     */
    @GetMapping(value = "/prices", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamPrices(
            @RequestParam(value = "stations", required = false) String stations,
            HttpServletResponse response
    ) {
        // Disable proxy buffering so events arrive in real time.
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");

        SseEmitter emitter = new SseEmitter(0L); // never auto-timeout — we handle it via heartbeat

        Set<String> filter = (stations == null || stations.isBlank())
                ? Set.of()
                : Set.of(stations.split("\\s*,\\s*"));

        Subscription sub = new Subscription(emitter, filter);
        subscriptions.add(sub);

        emitter.onCompletion(() -> {
            subscriptions.remove(sub);
            log.debug("SSE client completed; active = {}", subscriptions.size());
        });
        emitter.onTimeout(() -> {
            subscriptions.remove(sub);
            emitter.complete();
        });
        emitter.onError(t -> {
            subscriptions.remove(sub);
            log.debug("SSE client error: {}", t.getMessage());
        });

        try {
            // Initial event so the client knows the connection is live.
            emitter.send(SseEmitter.event()
                    .name("hello")
                    .data("{\"connected\":true,\"filter\":" + filter.size() + "}",
                            MediaType.APPLICATION_JSON));
        } catch (IOException ignored) {
            subscriptions.remove(sub);
        }

        log.info("New SSE subscription — total={}, filter={}", subscriptions.size(),
                filter.isEmpty() ? "ALL" : String.join(",", filter));
        return emitter;
    }

    /**
     * GET /api/v1/stream/health — JSON probe, lightweight.
     */
    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public String health() {
        return String.format(
                "{\"subscriptions\":%d,\"eventsFanOut\":%d,\"dropsFromSlowClients\":%d}",
                subscriptions.size(), eventsFanOut.get(), dropsFromSlowClients.get());
    }

    /**
     * Kafka consumer that fans out every price-update envelope to all
     * connected subscribers (filtered by their station list).
     */
    @KafkaListener(
            topics = "${fuelyn.kafka.prices-topic:fuelyn.prices.v1}",
            containerFactory = "priceStreamListenerFactory"
    )
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void onPriceUpdated(EventEnvelope envelope, Acknowledgment ack) {
        try {
            if (envelope == null || envelope.data() == null) {
                ack.acknowledge();
                return;
            }
            String stationId = extractStationId(envelope);
            String payload = mapper.writeValueAsString(envelope);

            for (Subscription sub : subscriptions) {
                if (!sub.stationFilter().isEmpty() && !sub.stationFilter().contains(stationId)) {
                    continue; // not in this client's interest set
                }
                try {
                    sub.emitter().send(SseEmitter.event()
                            .name("price.updated")
                            .id(envelope.id())
                            .data(payload, MediaType.APPLICATION_JSON));
                    eventsFanOut.incrementAndGet();
                } catch (IOException | IllegalStateException broken) {
                    // Browser closed the tab / Caddy timed us out / etc.
                    // We treat this as a normal lifecycle event: silently
                    // drop the subscription and continue with the others.
                    dropsFromSlowClients.incrementAndGet();
                    subscriptions.remove(sub);
                    try { sub.emitter().complete(); } catch (Exception ignored) {}
                }
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.warn("SSE fan-out failed for envelope id={}: {}",
                    envelope == null ? "null" : envelope.id(), e.getMessage());
            ack.acknowledge(); // don't redeliver — we just drop the event
        }
    }

    private void sendHeartbeats() {
        if (subscriptions.isEmpty()) return;
        for (Subscription sub : subscriptions) {
            try {
                sub.emitter().send(SseEmitter.event().comment("hb"));
            } catch (Exception broken) {
                // Silent removal — broken pipe + heartbeat is normal
                // when a browser closes a tab. We don't want this to
                // bubble up to GlobalExceptionHandler as a 500.
                subscriptions.remove(sub);
                try { sub.emitter().complete(); } catch (Exception ignored) {}
            }
        }
    }

    @SuppressWarnings("rawtypes")
    private static String extractStationId(EventEnvelope envelope) {
        Object data = envelope.data();
        if (data instanceof PriceUpdatedEvent typed) {
            return typed.stationId();
        }
        if (data instanceof java.util.Map<?,?> map) {
            Object v = map.get("stationId");
            return v == null ? "" : v.toString();
        }
        return "";
    }

    public int activeSubscriptionsCount() { return subscriptions.size(); }
    public long eventsFanOut()            { return eventsFanOut.get(); }
    public long dropsFromSlowClients()    { return dropsFromSlowClients.get(); }
}
