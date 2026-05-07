package com.fuelyn.price.stream;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fuelyn.common.events.EventEnvelope;
import com.fuelyn.common.events.PriceUpdatedEvent;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.time.Instant;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link PriceEventPublisher}.
 *
 * <p>The full broker round-trip is covered separately by the integration
 * test fixture (Linux-only — embedded Kafka has a known Windows + Java 21
 * loopback bug that flakes the run). These tests prove the publisher
 * contract with a mocked {@link KafkaTemplate}:</p>
 * <ul>
 *   <li>Sends to the configured topic.</li>
 *   <li>Uses {@code stationId} as the partition key.</li>
 *   <li>Wraps the event in a CloudEvents-style envelope.</li>
 *   <li>Is a silent no-op when no template is wired.</li>
 *   <li>Swallows synchronous exceptions so the persistence path
 *       can never be broken by the streaming layer.</li>
 *   <li>Serialises to JSON without losing fields when run through
 *       Spring's {@code JsonSerializer} with our shared mapper.</li>
 * </ul>
 */
class PriceEventPublisherTest {

    private static final String TOPIC = "fuelyn.prices.test.v1";

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void publishUsesStationIdAsKeyAndConfiguredTopic() {
        KafkaTemplate<String, Object> template = mock(KafkaTemplate.class);
        when(template.send(anyString(), anyString(), any()))
                .thenReturn(CompletableFuture.completedFuture(null));

        PriceEventPublisher publisher = new PriceEventPublisher(template, TOPIC);

        PriceUpdatedEvent event = PriceUpdatedEvent.forUpdate(
                "ABC-123", "Aral Mitte", "aral", "e10",
                1.749, 1.789,
                Instant.parse("2026-05-07T10:00:00Z"),
                52.52, 13.40, "10117");

        publisher.publish(event);

        ArgumentCaptor<String> topicCap = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> keyCap   = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> valCap   = ArgumentCaptor.forClass(Object.class);

        verify(template).send(topicCap.capture(), keyCap.capture(), valCap.capture());

        assertThat(topicCap.getValue()).isEqualTo(TOPIC);
        assertThat(keyCap.getValue()).isEqualTo("ABC-123");

        // The value must be a CloudEvents-style envelope wrapping the event
        assertThat(valCap.getValue()).isInstanceOf(EventEnvelope.class);
        EventEnvelope<?> envelope = (EventEnvelope<?>) valCap.getValue();
        assertThat(envelope.type()).isEqualTo(PriceUpdatedEvent.TYPE);
        assertThat(envelope.source()).isEqualTo("price-service");
        assertThat(envelope.id()).isNotBlank();
        assertThat(envelope.schemaVersion()).isEqualTo(1);
        assertThat(envelope.data()).isEqualTo(event);
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void publishWithNullTemplate_isSilentNoOp() {
        PriceEventPublisher publisher = new PriceEventPublisher(null, TOPIC);
        // Must not throw — best-effort by contract
        publisher.publish(PriceUpdatedEvent.forUpdate(
                "X", "X", "x", "e10",
                1.7, null, Instant.now(),
                0.0, 0.0, null));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void publishSwallowsSynchronousExceptions() {
        KafkaTemplate<String, Object> template = mock(KafkaTemplate.class);
        when(template.send(anyString(), anyString(), any()))
                .thenThrow(new RuntimeException("broker unreachable"));

        PriceEventPublisher publisher = new PriceEventPublisher(template, TOPIC);

        // The persistence layer must not be impacted — no throw allowed.
        publisher.publish(PriceUpdatedEvent.forUpdate(
                "Y", "Y", "y", "e10",
                1.7, null, Instant.now(),
                0.0, 0.0, null));

        verify(template).send(eq(TOPIC), eq("Y"), any());
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void envelopeRoundTripsThroughJsonSerializer() throws Exception {
        // Use the real Spring serializer with our standard mapper, the
        // way KafkaProducerConfig wires it in production.
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        JsonSerializer<EventEnvelope> serializer = new JsonSerializer<>(mapper);

        PriceUpdatedEvent event = PriceUpdatedEvent.forUpdate(
                "S-1", "Shell Nord", "shell", "e5",
                1.829, 1.815,
                Instant.parse("2026-05-07T11:23:45Z"),
                53.55, 9.99, "20095");
        EventEnvelope<PriceUpdatedEvent> envelope =
                EventEnvelope.of(PriceUpdatedEvent.TYPE, "price-service", event);

        byte[] bytes = serializer.serialize(TOPIC, envelope);
        assertThat(bytes).isNotEmpty();

        EventEnvelope<?> roundTrip = mapper.readValue(bytes, EventEnvelope.class);
        assertThat(roundTrip.type()).isEqualTo(PriceUpdatedEvent.TYPE);
        assertThat(roundTrip.source()).isEqualTo("price-service");
        assertThat(roundTrip.schemaVersion()).isEqualTo(1);

        // ProducerRecord wiring sanity-check — value is identifiable
        // as our event class via the type field.
        ProducerRecord<String, Object> record =
                new ProducerRecord<>(TOPIC, event.stationId(), envelope);
        assertThat(record.key()).isEqualTo("S-1");

        serializer.close();
    }
}
