package com.fuelyn.price.stream;

import java.util.concurrent.CompletableFuture;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.fuelyn.common.events.EventEnvelope;
import com.fuelyn.common.events.PriceUpdatedEvent;

/**
 * Publishes price-update events to the streaming bus.
 *
 * <p>Lives downstream of the persistence layer so we only emit events for prices we actually
 * accepted. Wrapped in a defensive try/catch: the streaming bus must never block or break the
 * persistence path.
 *
 * <p>{@code KafkaTemplate} injection is optional ({@code required = false}): when {@code
 * fuelyn.kafka.publisher.enabled=false} (or no broker is reachable at startup) the bean is absent
 * and {@link #publish} becomes a silent no-op. That preserves the existing behaviour of the
 * price-service in tests and in environments without Redpanda.
 */
@Component
public class PriceEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(PriceEventPublisher.class);
    private static final String SOURCE = "price-service";

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final String topic;

    @Autowired
    public PriceEventPublisher(
            @Autowired(required = false) KafkaTemplate<String, Object> kafkaTemplate,
            @Value("${fuelyn.kafka.prices-topic:fuelyn.prices.v1}") String topic) {
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
        log.info(
                "PriceEventPublisher ready — broker={}, topic={}",
                kafkaTemplate == null ? "DISABLED" : "connected",
                topic);
    }

    /**
     * Best-effort publish. Never throws. Returns immediately; failures are logged via the
     * underlying KafkaTemplate's send-callback.
     */
    public void publish(PriceUpdatedEvent event) {
        if (kafkaTemplate == null) return; // publisher disabled / no broker
        try {
            EventEnvelope<PriceUpdatedEvent> envelope =
                    EventEnvelope.of(PriceUpdatedEvent.TYPE, SOURCE, event);

            // Key by stationId so all events for one station land on
            // the same partition and stay strictly ordered.
            CompletableFuture<?> future = kafkaTemplate.send(topic, event.stationId(), envelope);
            future.whenComplete(
                    (result, ex) -> {
                        if (ex != null) {
                            log.warn(
                                    "Kafka publish failed for {} {}: {}",
                                    event.stationId(),
                                    event.fuelType(),
                                    ex.getMessage());
                        } else if (log.isDebugEnabled()) {
                            log.debug(
                                    "Published price event {}/{} → {}",
                                    event.stationId(),
                                    event.fuelType(),
                                    envelope.id());
                        }
                    });
        } catch (Exception e) {
            // Defensive: never let a streaming hiccup break the
            // persistence transaction we were called from.
            log.warn("Kafka publish threw synchronously: {}", e.getMessage());
        }
    }
}
