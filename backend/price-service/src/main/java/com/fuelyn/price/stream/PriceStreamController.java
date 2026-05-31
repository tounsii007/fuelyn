package com.fuelyn.price.stream;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fuelyn.common.events.EventEnvelope;
import com.fuelyn.common.events.PriceUpdatedEvent;

/**
 * Server-Sent Events bridge from the price-update Kafka topic to connected browsers.
 *
 * <p>Clients subscribe via {@code GET /api/v1/stream/prices} (optionally filtered by {@code
 * ?stations=ID1,ID2,…}) and receive a continuous stream of JSON events shaped like the underlying
 * {@link com.fuelyn.common.events.EventEnvelope}. Each event arrives as soon as Kafka delivers it —
 * typically within ~50 ms of Tankerkönig confirming the price change, so users see live prices
 * without manual refresh.
 *
 * <h3>Resilience</h3>
 *
 * <ul>
 *   <li>Heartbeat (15 s) keeps idle connections open through the Caddy default 30 s read-timeout.
 *   <li>{@code SseEmitter} lifecycle hooks remove disconnected clients so a hung browser tab can't
 *       leak server resources.
 *   <li>The Kafka listener catches per-event exceptions so one bad payload can't stall the topic
 *       for everybody.
 * </ul>
 *
 * <h3>Backpressure</h3>
 *
 * <p>SSE is push-only. If a browser is too slow to drain its receive buffer the underlying TCP send
 * blocks; we time out the emitter (60 s default) and let the client reconnect — losing a few events
 * is acceptable for live-price UX.
 */
@RestController
@RequestMapping("/api/v1/stream")
@ConditionalOnProperty(
        prefix = "fuelyn.kafka.consumer",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class PriceStreamController {

    private static final Logger log = LoggerFactory.getLogger(PriceStreamController.class);

    /** Per-client subscription record. */
    private record Subscription(SseEmitter emitter, Set<String> stationFilter) {}

    private final Set<Subscription> subscriptions = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService heartbeats =
            Executors.newSingleThreadScheduledExecutor(
                    r -> {
                        Thread t = new Thread(r, "sse-heartbeat");
                        t.setDaemon(true);
                        return t;
                    });

    /**
     * Per-subscriber send executor. We hand fan-out off the Kafka consumer thread so a single slow
     * client (slow TCP send buffer drain on a flaky mobile network) can no longer block the topic
     * for everyone else. Virtual threads (Java 21) are the right tool here: a typical SSE send is
     * mostly I/O wait, so we want hundreds of cheap threads not a small platform-thread pool with a
     * queue.
     */
    private final ExecutorService fanOutExecutor = Executors.newVirtualThreadPerTaskExecutor();

    private final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());

    /** Total events fan-out so far; surfaced in the management endpoint. */
    private final AtomicLong eventsFanOut = new AtomicLong();

    private final AtomicLong dropsFromSlowClients = new AtomicLong();
    private final AtomicLong subscriptionsRejected = new AtomicLong();

    /**
     * Hard ceiling on concurrent SSE subscriptions per JVM. New connections over the limit are
     * refused with 503 + Retry-After. Set generously so normal use never trips it; protects against
     * unbounded growth from browsers leaking tabs or a runaway client reconnect loop.
     */
    private final int maxSubscriptions;

    public PriceStreamController(
            @Value("${fuelyn.stream.max-subscriptions:5000}") int maxSubscriptions) {
        this.maxSubscriptions = maxSubscriptions;
        // Send a heartbeat comment to every connection every 15 s.
        heartbeats.scheduleAtFixedRate(this::sendHeartbeats, 15, 15, TimeUnit.SECONDS);
    }

    /**
     * Tear down both executors on graceful shutdown so a hot reload doesn't leak threads. Daemon
     * flag protects an unclean exit, this protects a clean one — and stops the heartbeat scheduler
     * from firing into a half-disposed state during shutdown.
     */
    @PreDestroy
    public void shutdown() {
        heartbeats.shutdownNow();
        fanOutExecutor.shutdown();
        try {
            if (!fanOutExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                fanOutExecutor.shutdownNow();
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            fanOutExecutor.shutdownNow();
        }
    }

    /**
     * GET /api/v1/stream/prices?stations=ID1,ID2
     *
     * <p>Optional {@code stations} filter limits the stream to the given station IDs
     * (comma-separated). Empty / missing → all stations. Useful for the favourites view, which only
     * cares about a handful of locations.
     */
    @GetMapping(value = "/prices", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamPrices(
            @RequestParam(value = "stations", required = false) String stations,
            HttpServletResponse response) {
        // Reject new subscriptions over the cap before allocating any state.
        // The check is intentionally racy (size() then add()) — exceeding the
        // cap by one or two connections under contention is acceptable; what
        // matters is that we never grow unbounded.
        if (subscriptions.size() >= maxSubscriptions) {
            subscriptionsRejected.incrementAndGet();
            log.warn("SSE subscription rejected: cap of {} reached", maxSubscriptions);
            response.setHeader("Retry-After", "30");
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "SSE subscription cap reached");
        }

        // Disable proxy buffering so events arrive in real time.
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");

        SseEmitter emitter = new SseEmitter(0L); // never auto-timeout — we handle it via heartbeat

        Set<String> filter = parseStationFilter(stations);

        Subscription sub = new Subscription(emitter, filter);
        subscriptions.add(sub);

        emitter.onCompletion(
                () -> {
                    subscriptions.remove(sub);
                    log.debug("SSE client completed; active = {}", subscriptions.size());
                });
        emitter.onTimeout(
                () -> {
                    subscriptions.remove(sub);
                    emitter.complete();
                });
        emitter.onError(
                t -> {
                    subscriptions.remove(sub);
                    log.debug("SSE client error: {}", t.getMessage());
                });

        try {
            // Initial event so the client knows the connection is live.
            emitter.send(
                    SseEmitter.event()
                            .name("hello")
                            .data(
                                    "{\"connected\":true,\"filter\":" + filter.size() + "}",
                                    MediaType.APPLICATION_JSON));
        } catch (IOException ignored) {
            subscriptions.remove(sub);
        }

        log.info(
                "New SSE subscription — total={}, filter={}",
                subscriptions.size(),
                filter.isEmpty() ? "ALL" : String.join(",", filter));
        return emitter;
    }

    /** GET /api/v1/stream/health — JSON probe, lightweight. */
    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public String health() {
        return String.format(
                "{\"subscriptions\":%d,\"maxSubscriptions\":%d,\"eventsFanOut\":%d,"
                        + "\"dropsFromSlowClients\":%d,\"subscriptionsRejected\":%d}",
                subscriptions.size(),
                maxSubscriptions,
                eventsFanOut.get(),
                dropsFromSlowClients.get(),
                subscriptionsRejected.get());
    }

    /**
     * Kafka consumer that fans out every price-update envelope to all connected subscribers
     * (filtered by their station list).
     */
    @KafkaListener(
            topics = "${fuelyn.kafka.prices-topic:fuelyn.prices.v1}",
            containerFactory = "priceStreamListenerFactory")
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void onPriceUpdated(EventEnvelope envelope, Acknowledgment ack) {
        try {
            if (envelope == null || envelope.data() == null) {
                ack.acknowledge();
                return;
            }
            String stationId = extractStationId(envelope);
            String payload = mapper.writeValueAsString(envelope);
            String envelopeId = envelope.id();

            for (Subscription sub : subscriptions) {
                if (!sub.stationFilter().isEmpty() && !sub.stationFilter().contains(stationId)) {
                    continue; // not in this client's interest set
                }
                // Fire-and-forget per-subscriber send. We hand the actual
                // emitter.send (which can block on slow TCP drain) to a
                // virtual-thread executor so the Kafka consumer thread
                // returns immediately. The whole topic stops being held
                // hostage by one slow browser tab.
                fanOutExecutor.execute(() -> deliver(sub, payload, envelopeId));
            }
            // ACK as soon as fan-out is dispatched — the events are durable
            // on Kafka and any send-side failure is already accounted for
            // by removing the slow subscription. Holding the topic offset
            // until every send completes would just amplify bad-client tail
            // latency into broker lag.
            ack.acknowledge();
        } catch (Exception e) {
            log.warn(
                    "SSE fan-out failed for envelope id={}: {}",
                    envelope == null ? "null" : envelope.id(),
                    e.getMessage());
            ack.acknowledge(); // don't redeliver — we just drop the event
        }
    }

    /** Send a single envelope to a single subscriber, off the Kafka thread. */
    private void deliver(Subscription sub, String payload, String envelopeId) {
        try {
            sub.emitter()
                    .send(
                            SseEmitter.event()
                                    .name("price.updated")
                                    .id(envelopeId)
                                    .data(payload, MediaType.APPLICATION_JSON));
            eventsFanOut.incrementAndGet();
        } catch (IOException | IllegalStateException broken) {
            // Browser closed the tab / Caddy timed us out / etc.
            // We treat this as a normal lifecycle event: silently
            // drop the subscription and continue with the others.
            dropsFromSlowClients.incrementAndGet();
            subscriptions.remove(sub);
            try {
                sub.emitter().complete();
            } catch (Exception ignored) {
            }
        }
    }

    private void sendHeartbeats() {
        if (subscriptions.isEmpty()) return;
        // Hand each heartbeat off to the same virtual-thread executor that
        // runs price fan-out. The single-threaded scheduler that calls this
        // method must NOT block on per-subscriber I/O — one slow socket
        // would otherwise stall heartbeats for every other subscriber and
        // the proxy's read-timeout would tear down healthy connections.
        for (Subscription sub : subscriptions) {
            fanOutExecutor.execute(() -> deliverHeartbeat(sub));
        }
    }

    private void deliverHeartbeat(Subscription sub) {
        try {
            sub.emitter().send(SseEmitter.event().comment("hb"));
        } catch (Exception broken) {
            // Silent removal — broken pipe + heartbeat is normal when a
            // browser closes a tab. We don't want this to bubble up to
            // GlobalExceptionHandler as a 500.
            subscriptions.remove(sub);
            try {
                sub.emitter().complete();
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * Upper bound on the {@code ?stations=} filter string we will parse. The split itself is
     * linear, but we still cap the raw length so a pathologically long query param cannot pin a
     * request thread.
     */
    private static final int MAX_STATIONS_FILTER_LEN = 4096;

    /**
     * Parse the comma-separated {@code stations} filter into a set of IDs.
     *
     * <p>Uses a literal-comma split (not a {@code \s*,\s*} regex) to avoid super-linear
     * backtracking on hostile input, trims each token, and drops blanks. The result set also
     * deduplicates — the previous {@code Set.of(...)} would have thrown on a repeated station id.
     * Over-long inputs are truncated rather than rejected so a legitimate (tiny) favourites list
     * always works.
     */
    private static Set<String> parseStationFilter(String stations) {
        if (stations == null || stations.isBlank()) {
            return Set.of();
        }
        String bounded =
                stations.length() > MAX_STATIONS_FILTER_LEN
                        ? stations.substring(0, MAX_STATIONS_FILTER_LEN)
                        : stations;
        Set<String> ids = new HashSet<>();
        for (String token : bounded.split(",")) {
            String id = token.trim();
            if (!id.isEmpty()) {
                ids.add(id);
            }
        }
        return Set.copyOf(ids);
    }

    @SuppressWarnings("rawtypes")
    private static String extractStationId(EventEnvelope envelope) {
        Object data = envelope.data();
        if (data instanceof PriceUpdatedEvent typed) {
            return typed.stationId();
        }
        if (data instanceof java.util.Map<?, ?> map) {
            Object v = map.get("stationId");
            return v == null ? "" : v.toString();
        }
        return "";
    }

    public int activeSubscriptionsCount() {
        return subscriptions.size();
    }

    public long eventsFanOut() {
        return eventsFanOut.get();
    }

    public long dropsFromSlowClients() {
        return dropsFromSlowClients.get();
    }
}
