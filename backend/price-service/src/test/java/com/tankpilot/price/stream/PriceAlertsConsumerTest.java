package com.tankpilot.price.stream;

import com.tankpilot.common.events.EventEnvelope;
import com.tankpilot.common.events.PriceUpdatedEvent;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.support.Acknowledgment;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Unit tests for {@link PriceAlertsConsumer}.
 *
 * <p>Covers the alert-firing rule (Δ ≥ 3 ct triggers, smaller deltas
 * do not), the metric counters, and graceful handling of malformed
 * envelopes (no payload / null delta).</p>
 */
class PriceAlertsConsumerTest {

    private static EventEnvelope<PriceUpdatedEvent> envelopeWith(double newPrice, Double previousPrice) {
        return EventEnvelope.of(
                PriceUpdatedEvent.TYPE,
                "test",
                PriceUpdatedEvent.forUpdate(
                        "S1", "Aral X", "aral", "e10",
                        newPrice, previousPrice,
                        Instant.parse("2026-05-07T10:00:00Z"),
                        52.5, 13.4, "10117"));
    }

    @Test
    void firesAlertForSignificantDrop() {
        PriceAlertsConsumer consumer = new PriceAlertsConsumer();
        Acknowledgment ack = mock(Acknowledgment.class);

        // Drop of 4 ct → above threshold
        consumer.onPriceUpdated(envelopeWith(1.749, 1.789), ack);

        assertThat(consumer.getEventsSeen()).isEqualTo(1);
        assertThat(consumer.getAlertsFired()).isEqualTo(1);
        verify(ack, times(1)).acknowledge();
    }

    @Test
    void firesAlertForSignificantRise() {
        PriceAlertsConsumer consumer = new PriceAlertsConsumer();
        Acknowledgment ack = mock(Acknowledgment.class);

        // Rise of 5 ct → above threshold
        consumer.onPriceUpdated(envelopeWith(1.799, 1.749), ack);

        assertThat(consumer.getAlertsFired()).isEqualTo(1);
        verify(ack).acknowledge();
    }

    @Test
    void doesNotFireForSubThresholdChange() {
        PriceAlertsConsumer consumer = new PriceAlertsConsumer();
        Acknowledgment ack = mock(Acknowledgment.class);

        // Δ = 1 ct → below threshold (3 ct)
        consumer.onPriceUpdated(envelopeWith(1.799, 1.789), ack);

        assertThat(consumer.getEventsSeen()).isEqualTo(1);
        assertThat(consumer.getAlertsFired()).isEqualTo(0);
        verify(ack).acknowledge();
    }

    @Test
    void doesNotFireWhenNoPreviousPrice() {
        PriceAlertsConsumer consumer = new PriceAlertsConsumer();
        Acknowledgment ack = mock(Acknowledgment.class);

        // First-ever observation — deltaPrice is null
        consumer.onPriceUpdated(envelopeWith(1.799, null), ack);

        assertThat(consumer.getAlertsFired()).isEqualTo(0);
        verify(ack).acknowledge();
    }

    @Test
    void survivesNullEnvelopeWithoutThrowing() {
        PriceAlertsConsumer consumer = new PriceAlertsConsumer();
        Acknowledgment ack = mock(Acknowledgment.class);

        consumer.onPriceUpdated(null, ack);

        assertThat(consumer.getAlertsFired()).isEqualTo(0);
        // Even null envelopes get acked so we don't loop on poison messages
        verify(ack).acknowledge();
    }
}
