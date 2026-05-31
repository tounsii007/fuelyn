package com.fuelyn.ai.anomaly;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * In-memory SSE broadcaster for {@link PriceAnomalyDetector} events.
 *
 * <p>Each subscriber holds an {@link SseEmitter} that we add to the fan-out list. On a new anomaly
 * we iterate the list and write the event; failed writes prune the dead emitter.
 *
 * <p>Concurrency: {@link CopyOnWriteArrayList} is fine at our scale (low write rate, modest reader
 * count). For hundreds of concurrent subscribers we'd switch to a {@code ConcurrentLinkedQueue} or
 * a Project Reactor {@code Sinks.Many} broadcaster.
 *
 * <p>This component is memory-only — no Redis pub-sub, no Kafka fan-out. A multi-instance
 * deployment will need to broadcast across replicas (Kafka topic {@code fuelyn.ai.anomalies.v1});
 * for now a single ai-service instance is fine.
 */
@Component
public class AnomalyBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(AnomalyBroadcaster.class);

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    /** Subscribe a fresh SSE emitter. The caller wires lifecycle handlers. */
    public SseEmitter subscribe() {
        // Long timeout — SSE connections are kept open until the client
        // disconnects. Browsers reconnect automatically on EventSource
        // failures, so a finite timeout just adds reconnection churn.
        SseEmitter emitter = new SseEmitter(0L);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError((t) -> emitters.remove(emitter));
        emitters.add(emitter);
        try {
            // Send a "hello" comment so the connection stays alive on
            // load balancers that close idle TCP. Comments (lines
            // starting with `:`) are ignored by EventSource clients.
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException e) {
            emitters.remove(emitter);
        }
        log.debug("Anomaly subscriber added, total={}", emitters.size());
        return emitter;
    }

    /** Fan-out the anomaly to every live emitter. Best-effort; failures prune. */
    public void publish(PriceAnomalyDetector.Anomaly anomaly) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("anomaly").data(anomaly));
            } catch (Exception e) {
                emitters.remove(emitter);
            }
        }
    }

    public int subscriberCount() {
        return emitters.size();
    }
}
